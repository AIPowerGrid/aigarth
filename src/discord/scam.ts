import {
  type Client,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { config } from "../config.js";
import { banVotes, type BanVote, type VoteAction } from "../store/db.js";
import { extractUrls } from "../util/net.js";
import { log } from "../util/log.js";

/**
 * Community moderation engine. Aigarth's model decides whether to call the
 * moderation tools; this module never classifies message content. It snapshots
 * redacted evidence, persists votes, and enforces only after human quorum.
 */

const INVITE_RE =
  /\b(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([a-z0-9-]+)/gi;

function redact(content: string): string {
  let c = content.replace(INVITE_RE, "[Discord invite removed]");
  for (const u of extractUrls(content)) c = c.split(u).join("[link removed]");
  c = c.replace(/<@!?\d+>/g, "[mention removed]");
  c = c.replace(/(^|[\s([])@[a-z0-9_]{4,32}\b/gi, "$1[account removed]");
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
 * dismiss it. The model proposes through `start_ban_poll` /
 * `start_delete_poll`; the community decides.
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
    const safeReason = redact(v.reason);
    const desc = [
      lead,
      `**Why:** ${safeReason}`,
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
      safeReason,
      v.action,
      v.targetMsgId ?? null,
    );
    log.info("moderation vote opened", {
      action: v.action,
      target: v.targetUserId,
      reason: safeReason,
    });
    return "opened";
  } finally {
    openingVotes.delete(key);
  }
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
    // New 'ban' polls always ban; legacy 'moderate' rows honor SCAM_OUTCOME.
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
