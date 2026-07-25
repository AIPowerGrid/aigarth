import {
  type Message,
  type Client,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
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
 *    (unofficial invite links, support impersonation + a non-AIPG destination,
 *    or known wallet-drainer phrasing + a link). Any uncertainty → don't flag.
 *  - Registered-host allow/deny via real URL parsing, never substrings.
 *  - The bot does NOT self-vote. Humans decide.
 *  - High-confidence deterministic detections request a ban, but the bot never
 *    enacts one without the configured human vote threshold.
 *  - Votes are persisted (survive restarts) and handled via raw reaction events.
 */

const TRUSTED_HOSTS = [
  "aipowergrid.io",
  "aipg.art",
  "aipg.chat",
  "aipg.music",
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

const OFFICIAL_SUPPORT_HOSTS = [
  "aipowergrid.io",
  "aipg.art",
  "aipg.chat",
  "aipg.music",
];

const SUPPORT_CTA = [
  /\b(?:official|verified|authorized)\s+(?:(?:aipg|ai power grid)\s+)?(?:support|admin|moderator|mod|help\s*desk|staff)\b/i,
  /\b(?:aipg|ai power grid)\s+(?:support|admin|moderator|mod|help\s*desk|staff)\b/i,
  /\b(?:contact|message|dm|reach|speak to|chat with)\s+(?:(?:our|the|official|aipg|ai power grid)\s+){0,2}(?:support|admin|moderator|mod|help\s*desk|staff)\b/i,
  /\b(?:open|create|submit)\s+(?:a\s+)?(?:support\s+)?ticket\b/i,
  /\b(?:support|help)\s+(?:portal|desk|agent|team|link|here)\b/i,
  /\b(?:need help|having (?:an )?issue|for help)\b.{0,80}\b(?:contact|message|dm|visit|click|open)\b/i,
];

const INVITE_RE =
  /\b(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([a-z0-9-]+)/gi;

function registeredHost(host: string): string {
  const parts = host.split(".");
  return parts.length >= 2 ? parts.slice(-2).join(".") : host;
}

function isTrusted(host: string): boolean {
  const reg = registeredHost(host);
  return TRUSTED_HOSTS.some((t) => reg === t);
}

function inviteCodes(content: string): string[] {
  return [...content.matchAll(INVITE_RE)].map((match) => match[1].toLowerCase());
}

function isOfficialInviteCode(code: string): boolean {
  return config.officialDiscordInviteCodes.some((official) => official.toLowerCase() === code);
}

function isOfficialSupportUrl(raw: string, guildId?: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (OFFICIAL_SUPPORT_HOSTS.includes(registeredHost(host))) return true;
  if (
    host === "github.com" &&
    url.pathname.split("/").filter(Boolean)[0]?.toLowerCase() === "aipowergrid"
  ) {
    return true;
  }
  const normalizedPath = url.pathname.replace(/\/+$/, "").toLowerCase();
  if (
    ((host === "x.com" || host === "twitter.com") && normalizedPath === "/aipowergrid") ||
    (host === "t.me" && normalizedPath === "/aipowergrid") ||
    ((host === "youtube.com" || host === "www.youtube.com") && normalizedPath === "/@aipowergrid")
  ) {
    return true;
  }
  const code = inviteCodes(raw)[0];
  if (code && isOfficialInviteCode(code)) return true;
  if (host === "discord.com" && guildId && url.pathname.startsWith(`/channels/${guildId}/`)) {
    return true;
  }
  return false;
}

function supportIdentity(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[._-]+/g, " ");
  const brand = /\b(?:aipg|ai power grid)\b/.test(normalized);
  const authority = /\b(?:support|admin|moderator|mod|help\s*desk)\b/.test(normalized);
  return brand && authority;
}

export interface ScamVerdict {
  flagged: boolean;
  reason: string;
}

export interface ScamContext {
  authorName?: string;
  guildId?: string;
  trustedAuthor?: boolean;
}

/** Does the message contain a link to a host NOT on the trusted allowlist? Used to
 *  route link posts to aigarth's judgment so it can ban-poll a shady one (a normal
 *  link from a regular isn't necessarily bad — the LLM decides). */
export function hasUntrustedLink(content: string): boolean {
  return extractUrls(content)
    .some((url) => {
      const host = hostOf(url);
      return !!host && !isTrusted(host) && !isOfficialSupportUrl(url);
    });
}

/** Deterministic screen. Fails closed (no signal → not flagged). */
export function screenMessage(content: string, context: ScamContext = {}): ScamVerdict {
  const lower = content.toLowerCase();
  const urls = extractUrls(content);
  const untrusted = urls
    .filter((url) => {
      const host = hostOf(url);
      return !!host && !isTrusted(host) && !isOfficialSupportUrl(url, context.guildId);
    })
    .map(hostOf)
    .filter((host): host is string => !!host);

  // AIPG publishes one exact invite. Any other Discord invite is a classic
  // impersonation/raid vector, including scheme-less links.
  const unofficialInvite = inviteCodes(content).find((code) => !isOfficialInviteCode(code));
  if (unofficialInvite) {
    return { flagged: true, reason: "Posted an unofficial Discord invite link." };
  }

  // "AIPG Support" accounts and support/admin calls-to-action may only direct
  // people to AIPG-owned destinations. This catches flash-and-delete support
  // impersonation without treating ordinary links or requests for help as scams.
  const supportClaim =
    !context.trustedAuthor &&
    (supportIdentity(context.authorName ?? "") || SUPPORT_CTA.some((pattern) => pattern.test(content)));
  const unofficialSupportUrl = urls.find((url) => !isOfficialSupportUrl(url, context.guildId));
  if (supportClaim && unofficialSupportUrl) {
    const host = hostOf(unofficialSupportUrl) ?? "unknown host";
    return {
      flagged: true,
      reason: `Impersonated AIPG/support while directing users to an unofficial destination (${host}).`,
    };
  }
  // Wallet-drainer phrasing alongside an untrusted link = high confidence.
  const drainer = DRAINER_PHRASES.find((p) => lower.includes(p));
  if (drainer && untrusted.length > 0) {
    return { flagged: true, reason: `Wallet-drainer phrasing ("${drainer}") with an untrusted link.` };
  }
  return { flagged: false, reason: "" };
}

function redact(content: string): string {
  let c = content.replace(INVITE_RE, "[Discord invite removed]");
  for (const u of extractUrls(content)) c = c.split(u).join("[link removed]");
  // Keep attacker-controlled evidence inside the poll's code block.
  c = c.replace(/`/g, "'");
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

export type VoteOpenResult = "opened" | "duplicate" | "unavailable";
const openingVotes = new Set<string>();
const enforcingVotes = new Set<string>();

/**
 * Open a persisted community vote and seed its ✅/❌ reactions. The bot never
 * self-votes; `config.banVoteThreshold` human ✅ enact the action, threshold ❌
 * dismiss it. Used by the deterministic scam screen and the AI's
 * `start_ban_poll` / `start_delete_poll` tools
 * — the model proposes, the community decides.
 */
export async function openModerationVote(v: ModerationVote): Promise<VoteOpenResult> {
  if (!v.channel || !("send" in v.channel)) return "unavailable";
  const key = `${v.guildId}:${v.targetUserId}:${v.action}`;
  if (openingVotes.has(key) || banVotes.activeForTarget(v.guildId, v.targetUserId, v.action)) {
    log.info("moderation vote suppressed; active vote exists", {
      action: v.action,
      target: v.targetUserId,
    });
    return "duplicate";
  }
  openingVotes.add(key);
  try {
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
    const canEnforceBan =
      v.action !== "ban" ||
      !!v.channel.guild?.members?.me?.permissions.has(PermissionFlagsBits.BanMembers);
    const desc = [
      lead,
      `**Why:** ${v.reason}`,
      v.evidence ? `\n**Message (redacted):**\n\`\`\`${redact(v.evidence)}\`\`\`` : "",
      !canEnforceBan
        ? "\n**Enforcement warning:** Aigarth's role still needs the Discord `Ban Members` permission."
        : "",
      `\nReact ✅ to ${verb}, ❌ to dismiss. ${n} votes decide.`,
    ]
      .filter(Boolean)
      .join("\n");
    const embed = new EmbedBuilder().setTitle(title).setColor(0xff5555).setDescription(desc);
    const voteMsg = await v.channel.send({ embeds: [embed] });
    await voteMsg.react("✅").catch(() => {});
    await voteMsg.react("❌").catch(() => {});
    banVotes.create(
      voteMsg.id,
      voteMsg.channelId,
      v.guildId,
      v.targetUserId,
      v.reason,
      v.action,
      v.targetMsgId ?? null,
    );
    log.info("moderation vote opened", {
      action: v.action,
      target: v.targetUserId,
      reason: v.reason,
    });
    return "opened";
  } finally {
    openingVotes.delete(key);
  }
}

/** Deterministic high-confidence scam screen → an explicit community ban poll.
 * The message snapshot is captured before awaiting Discord, so a flash deletion
 * cannot erase the redacted evidence shown to voters. */
export async function openBanVote(message: Message, reason: string): Promise<VoteOpenResult> {
  if (!message.guild) return "unavailable";
  return openModerationVote({
    channel: message.channel,
    guildId: message.guild.id,
    targetUserId: message.author.id,
    action: "ban",
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
  if (enforcingVotes.has(messageId)) return;

  const up = new Set(vote.up);
  const down = new Set(vote.down);
  const set = emoji === "✅" ? up : down;
  if (add) set.add(userId);
  else set.delete(userId);
  banVotes.setVotes(messageId, [...up], [...down]);

  if (up.size >= config.banVoteThreshold) {
    enforcingVotes.add(messageId);
    try {
      if (await enforce(client, vote)) banVotes.resolve(messageId);
    } finally {
      enforcingVotes.delete(messageId);
    }
  } else if (down.size >= config.dismissVoteThreshold) {
    banVotes.resolve(messageId);
    log.info("moderation vote dismissed", { messageId });
  }
}

/** Carry out a passed vote: delete the message, or ban/timeout the user. */
async function enforce(client: Client, vote: BanVote): Promise<boolean> {
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
      return true;
    }
    const guild = await client.guilds.fetch(vote.guild_id);
    // 'ban' polls always ban; the scam screen ('moderate') honors SCAM_OUTCOME.
    const ban = vote.action === "ban" || config.scamOutcome === "ban";
    if (ban) {
      // Ban by ID so leaving the server after posting cannot evade a passed vote.
      await guild.members.ban(vote.target_id, { reason: `community vote: ${vote.reason}` });
      log.warn("member banned by vote", { targetId: vote.target_id, reason: vote.reason });
    } else {
      const member = await guild.members.fetch(vote.target_id);
      await member.timeout(24 * 3600 * 1000, `community vote: ${vote.reason}`); // 24h, reversible
      log.warn("member timed out by vote", { targetId: vote.target_id, reason: vote.reason });
    }
    return true;
  } catch (e) {
    log.error("enforce failed", { action: vote.action, err: String(e) });
    return false;
  }
}
