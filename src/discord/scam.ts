import { type Message, type Client, EmbedBuilder } from "discord.js";
import { config } from "../config.js";
import { banVotes } from "../store/db.js";
import { extractUrls, hostOf } from "../util/net.js";
import { log } from "../util/log.js";

/**
 * Scam moderation — rebuilt per the audit.
 *
 * Old design: an LLM classified scams and FAILED OPEN TO BAN on any error
 * (an LLM hiccup → innocent user ban vote), used substring host "trust"
 * (github.com.evil.io passed), and the bot auto-cast a vote.
 *
 * New design:
 *  - Deterministic-first, FAIL CLOSED: we only flag on concrete signals
 *    (untrusted invite links, known wallet-drainer phrasing + a link). Any
 *    uncertainty → don't flag.
 *  - Registered-host allow/deny via real URL parsing, never substrings.
 *  - The bot does NOT self-vote. Humans decide.
 *  - Default outcome is a reversible TIMEOUT, not a ban.
 *  - Votes are persisted (survive restarts) and handled via raw reaction events.
 */

const TRUSTED_HOSTS = [
  "aipowergrid.io",
  "github.com",
  "etherscan.io",
  "basescan.org",
  "coingecko.com",
  "discord.com",
  "x.com",
  "twitter.com",
];

const DRAINER_PHRASES = [
  "free nitro",
  "claim your airdrop",
  "connect your wallet",
  "verify your wallet",
  "claim reward",
  "double your",
  "steam gift",
];

function registeredHost(host: string): string {
  const parts = host.split(".");
  return parts.length >= 2 ? parts.slice(-2).join(".") : host;
}

function isTrusted(host: string): boolean {
  const reg = registeredHost(host);
  return TRUSTED_HOSTS.some((t) => reg === t);
}

export interface ScamVerdict {
  flagged: boolean;
  reason: string;
}

/** Deterministic screen. Fails closed (no signal → not flagged). */
export function screenMessage(content: string): ScamVerdict {
  const lower = content.toLowerCase();
  const urls = extractUrls(content);
  const untrusted = urls.map(hostOf).filter((h): h is string => !!h && !isTrusted(h));

  // Unofficial Discord invite (classic raid/spam vector).
  const hasForeignInvite = /\b(discord\.gg|discord(?:app)?\.com\/invite)\//i.test(content);
  if (hasForeignInvite) {
    return { flagged: true, reason: "Posted a Discord invite link." };
  }
  // Wallet-drainer phrasing alongside an untrusted link = high confidence.
  const drainer = DRAINER_PHRASES.find((p) => lower.includes(p));
  if (drainer && untrusted.length > 0) {
    return { flagged: true, reason: `Wallet-drainer phrasing ("${drainer}") with an untrusted link.` };
  }
  return { flagged: false, reason: "" };
}

function redact(content: string): string {
  let c = content;
  for (const u of extractUrls(content)) c = c.split(u).join("[link removed]");
  return c.length > 400 ? c.slice(0, 400) + "…" : c;
}

/** Post a ban-vote message and persist it. No bot self-vote. */
export async function openBanVote(message: Message, reason: string): Promise<void> {
  if (!message.guild) return;
  if (!("send" in message.channel)) return;
  const embed = new EmbedBuilder()
    .setTitle("⚠️ Possible scam — community vote")
    .setColor(0xff5555)
    .setDescription(
      `Flagged message from <@${message.author.id}>.\n**Why:** ${reason}\n\n` +
        `**Evidence (redacted):**\n\`\`\`${redact(message.content)}\`\`\`\n` +
        `React ✅ to ${config.scamOutcome}, ❌ to dismiss. ` +
        `${config.banVoteThreshold} votes decide.`,
    );
  const voteMsg = await message.channel.send({ embeds: [embed] });
  await voteMsg.react("✅").catch(() => {});
  await voteMsg.react("❌").catch(() => {});
  banVotes.create(voteMsg.id, message.channelId, message.guild.id, message.author.id, reason);
  log.info("scam vote opened", { target: message.author.id, reason });
}

/**
 * Handle a raw reaction add/remove on a vote message. `add=false` for removals.
 * Returns when resolved (banned/timed-out/dismissed) so the caller can clean up.
 */
export async function handleVoteReaction(
  client: Client,
  messageId: string,
  emoji: string,
  userId: string,
  add: boolean,
): Promise<void> {
  if (emoji !== "✅" && emoji !== "❌") return;
  const vote = banVotes.get(messageId);
  if (!vote) return;
  if (userId === vote.target_id) return; // target can't vote on itself
  const bot = client.user?.id;
  if (bot && userId === bot) return; // ignore the bot's own seed reactions

  const up = new Set(vote.up);
  const down = new Set(vote.down);
  const set = emoji === "✅" ? up : down;
  if (add) set.add(userId);
  else set.delete(userId);
  banVotes.setVotes(messageId, [...up], [...down]);

  if (up.size >= config.banVoteThreshold) {
    await enforce(client, vote.guild_id, vote.target_id, vote.reason);
    banVotes.resolve(messageId);
  } else if (down.size >= config.dismissVoteThreshold) {
    banVotes.resolve(messageId);
    log.info("scam vote dismissed", { messageId });
  }
}

async function enforce(client: Client, guildId: string, targetId: string, reason: string): Promise<void> {
  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(targetId);
    if (config.scamOutcome === "ban") {
      await member.ban({ reason: `community vote: ${reason}` });
      log.warn("member banned by vote", { targetId, reason });
    } else {
      await member.timeout(24 * 3600 * 1000, `community vote: ${reason}`); // 24h, reversible
      log.warn("member timed out by vote", { targetId, reason });
    }
  } catch (e) {
    log.error("enforce failed", { targetId, err: String(e) });
  }
}
