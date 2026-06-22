import { type Message, type Client, EmbedBuilder } from "discord.js";
import { config } from "../config.js";
import { banVotes, type BanVote, type VoteAction } from "../store/db.js";
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

export interface ModerationVote {
  /** Channel to post the vote in (and, for delete, where the target lives). */
  channel: any;
  guildId: string;
  /** The user the vote concerns. */
  targetUserId: string;
  action: VoteAction;
  reason: string;
  /** The offending message text, shown redacted as evidence (optional). */
  evidence?: string;
  /** The message to delete if the vote passes (action='delete'). */
  targetMsgId?: string | null;
}

/**
 * Open a persisted community vote and seed its ✅/❌ reactions. The bot never
 * self-votes; `config.banVoteThreshold` human ✅ enact the action, threshold ❌
 * dismiss it. Used by the deterministic scam screen (action='moderate') AND by
 * the AI's `start_ban_poll` / `start_delete_poll` tools (action='ban'/'delete')
 * — the model proposes, the community decides.
 */
export async function openModerationVote(v: ModerationVote): Promise<void> {
  if (!v.channel || !("send" in v.channel)) return;
  const n = config.banVoteThreshold;
  const verb =
    v.action === "delete"
      ? "delete the message"
      : v.action === "ban"
        ? `ban <@${v.targetUserId}>`
        : `${config.scamOutcome} <@${v.targetUserId}>`;
  const title =
    v.action === "delete"
      ? "🗳️ Delete message — community vote"
      : v.action === "ban"
        ? "🗳️ Ban user — community vote"
        : "⚠️ Possible scam — community vote";
  const lead =
    v.action === "delete"
      ? `Proposed: delete a message from <@${v.targetUserId}>.`
      : `Proposed action on <@${v.targetUserId}>.`;
  const desc = [
    lead,
    `**Why:** ${v.reason}`,
    v.evidence ? `\n**Message (redacted):**\n\`\`\`${redact(v.evidence)}\`\`\`` : "",
    `\nReact ✅ to ${verb}, ❌ to dismiss. ${n} votes decide.`,
  ]
    .filter(Boolean)
    .join("\n");
  const embed = new EmbedBuilder().setTitle(title).setColor(0xff5555).setDescription(desc);
  const voteMsg = await v.channel.send({ embeds: [embed] });
  await voteMsg.react("✅").catch(() => {});
  await voteMsg.react("❌").catch(() => {});
  banVotes.create(voteMsg.id, voteMsg.channelId, v.guildId, v.targetUserId, v.reason, v.action, v.targetMsgId ?? null);
  log.info("moderation vote opened", { action: v.action, target: v.targetUserId, reason: v.reason });
}

/** Deterministic scam screen → a reversible community moderation vote. */
export async function openBanVote(message: Message, reason: string): Promise<void> {
  if (!message.guild) return;
  await openModerationVote({
    channel: message.channel,
    guildId: message.guild.id,
    targetUserId: message.author.id,
    action: "moderate",
    reason,
    evidence: message.content,
    targetMsgId: message.id,
  });
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
    await enforce(client, vote);
    banVotes.resolve(messageId);
  } else if (down.size >= config.dismissVoteThreshold) {
    banVotes.resolve(messageId);
    log.info("moderation vote dismissed", { messageId });
  }
}

/** Carry out a passed vote: delete the message, or ban/timeout the user. */
async function enforce(client: Client, vote: BanVote): Promise<void> {
  try {
    if (vote.action === "delete") {
      const ch = await client.channels.fetch(vote.channel_id).catch(() => null);
      if (ch && "messages" in ch && vote.target_msg_id) {
        const m = await (ch as any).messages.fetch(vote.target_msg_id).catch(() => null);
        if (m) {
          await m.delete();
          log.warn("message deleted by vote", { messageId: vote.target_msg_id, reason: vote.reason });
        }
      }
      return;
    }
    const guild = await client.guilds.fetch(vote.guild_id);
    const member = await guild.members.fetch(vote.target_id);
    // 'ban' polls always ban; the scam screen ('moderate') honors SCAM_OUTCOME.
    const ban = vote.action === "ban" || config.scamOutcome === "ban";
    if (ban) {
      await member.ban({ reason: `community vote: ${vote.reason}` });
      log.warn("member banned by vote", { targetId: vote.target_id, reason: vote.reason });
    } else {
      await member.timeout(24 * 3600 * 1000, `community vote: ${vote.reason}`); // 24h, reversible
      log.warn("member timed out by vote", { targetId: vote.target_id, reason: vote.reason });
    }
  } catch (e) {
    log.error("enforce failed", { action: vote.action, err: String(e) });
  }
}
