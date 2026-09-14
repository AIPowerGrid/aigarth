import {
  type Client,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { config } from "../config.js";
import { banVotes, redactStoredContent, type BanVote, type VoteAction } from "../store/db.js";
import { extractUrls } from "../util/net.js";
import { log } from "../util/log.js";

/**
 * Community moderation engine. Aigarth's model decides whether to call the
 * moderation tools; this module never classifies message content. It snapshots
 * redacted evidence, persists cases, and enforces only after authorized human approval.
 */

const INVITE_RE =
  /\b(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([a-z0-9-]+)/gi;

function redact(content: string): string {
  let c = redactStoredContent(content).replace(INVITE_RE, "[Discord invite removed]");
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
const reactionQueues = new Map<string, Promise<void>>();
const SAFE_MENTIONS = { parse: [] as never[] };

function buttons(id: string) {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`mod:ban:${id}`).setLabel("Ban").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`mod:delete:${id}`).setLabel("Delete message").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mod:dismiss:${id}`).setLabel("Dismiss").setStyle(ButtonStyle.Secondary),
  )];
}

async function memberFor(guild: any, id: string) {
  return guild.members.fetch({ user: id, force: true }).catch((error: any) => {
    if (error.code === 10007) return null;
    throw error;
  });
}

async function canActOn(guild: any, actor: any, targetId: string, action: string) {
  if (!permitted(actor, action) || actor.id === targetId) return false;
  if (action === "delete") return true;
  if (targetId === guild.ownerId) return false;
  const target = await memberFor(guild, targetId);
  return !target || actor.id === guild.ownerId || actor.roles.highest.comparePositionTo(target.roles.highest) > 0;
}

async function canDeleteIn(client: Client, channelId: string, actor: any): Promise<boolean> {
  const channel: any = await client.channels.fetch(channelId);
  return !!channel?.permissionsFor(actor)?.has(PermissionFlagsBits.ManageMessages);
}

async function eligibleVoter(client: Client, guild: any, vote: BanVote, actor: any): Promise<boolean> {
  if (!actor || actor.user.bot || actor.id === vote.target_id) return false;
  if (!config.communityVoterRoleIds.some(id => actor.roles.cache.has(id))) return false;
  const channel: any = await client.channels.fetch(vote.channel_id);
  if (!channel?.permissionsFor(actor)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory])) return false;
  if (vote.target_id === guild.ownerId || config.adminUserIds.includes(vote.target_id)) return false;
  const target = await memberFor(guild, vote.target_id);
  if (!target) return true; // Leaving after a scam must not evade a vote.
  const staffPermissions = [PermissionFlagsBits.Administrator, PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers];
  return !target.user.bot && !staffPermissions.some(p => target.permissions.has(p)) &&
    !config.protectedModerationRoleIds.some(id => target.roles.cache.has(id));
}

function permitted(member: any, action: string): boolean {
  if (!member || member.user?.bot) return false;
  return member.permissions.has(action === "delete"
    ? PermissionFlagsBits.ManageMessages : PermissionFlagsBits.BanMembers);
}

async function isBanned(guild: any, id: string): Promise<boolean> {
  try { await guild.bans.fetch(id); return true; }
  catch (error: any) { if (error.code === 10026) return false; throw error; }
}

async function updateCard(client: Client, vote: BanVote, status?: string) {
  try {
    const ch: any = await client.channels.fetch(vote.channel_id);
    const card = await ch.messages.fetch(vote.message_id);
    const embed = card.embeds[0] ? EmbedBuilder.from(card.embeds[0]) : new EmbedBuilder();
    // Refresh instructions on older cards without discarding their captured evidence.
    const description = (embed.data.description ?? "").split("\n")
      .filter(line => !line.startsWith("Moderator buttons below.") && !line.startsWith("React ✅ to ") &&
        !line.startsWith("Community voting:"))
      .join("\n");
    embed.setDescription(`${description}\nCommunity voting: ✅ approves the proposed action; ❌ dismisses. ${config.banVoteThreshold} approvals or ${config.dismissVoteThreshold} dismissals decide. Human users with the Members role who can see this case may vote. Staff and protected members cannot be targeted. Buttons are moderator-only.`.slice(0, 4096));
    const evidence = banVotes.evidence(vote.message_id);
    embed.setFooter({ text: status ?? `${evidence.length} observed message(s); ${evidence.filter(e => e.deleted_ts).length} deleted; ${evidence.filter(e => e.edited_ts).length} edited. Moderator approval or community quorum required.` });
    if (status) embed.setTitle(`Moderation: ${status}`).setColor(0x666666);
    await card.edit({ embeds: [embed], components: status ? [] : buttons(vote.message_id), allowedMentions: SAFE_MENTIONS });
  } catch (error) { log.warn("moderation card update failed", { caseId: vote.message_id, err: String(error) }); }
}

async function closeCase(client: Client, vote: BanVote, outcome: string, actor?: string) {
  banVotes.resolve(vote.message_id, outcome, actor ?? null);
  await updateCard(client, vote, outcome);
}

export async function reconcileBan(client: Client, guildId: string, userId: string) {
  for (const vote of banVotes.allActive().filter(v => v.guild_id === guildId && v.target_id === userId)) {
    await closeCase(client, vote, "Banned (confirmed by Discord)");
  }
}

export async function observeDeletion(client: Client, messageId: string) {
  banVotes.markDeleted(messageId);
  for (const vote of banVotes.allActive()) {
    if (!banVotes.evidence(vote.message_id).some(e => e.message_id === messageId)) continue;
    if (vote.action === "delete" && vote.target_msg_id === messageId) {
      await closeCase(client, vote, "Message already deleted");
    } else await updateCard(client, vote);
  }
}

export async function observeEdit(client: Client, messageId: string, content: string) {
  banVotes.markEdited(messageId, redact(content));
  for (const vote of banVotes.allActive()) {
    if (banVotes.evidence(vote.message_id).some(e => e.message_id === messageId)) await updateCard(client, vote);
  }
}

export async function reconcileCases(client: Client) {
  banVotes.pruneEvidence();
  for (const vote of banVotes.allActive()) {
    try {
      const guild = await client.guilds.fetch(vote.guild_id);
      if (await isBanned(guild, vote.target_id)) await closeCase(client, vote, "Already banned");
      else if (Date.now() - vote.created_ts >= config.banVoteTtlMs) await closeCase(client, vote, "Expired without action");
      else await updateCard(client, vote);
    } catch (error) { log.warn("moderation reconciliation failed", { caseId: vote.message_id, err: String(error) }); }
  }
}

/**
 * Open a persisted community vote and seed its ✅/❌ reactions. The bot never
 * self-votes. Authorized moderators can act directly; human community reactions
 * retain quorum behavior. The model only proposes through its existing tools.
 */
export async function openModerationVote(v: ModerationVote): Promise<VoteOpenResult> {
  if (!v.channel || !("send" in v.channel)) return "unavailable";
  const key = `${v.guildId}:${v.targetUserId}`;
  const existing = banVotes.activeForTarget(v.guildId, v.targetUserId, v.action);
  if (existing && v.targetMsgId) {
    banVotes.addEvidence(existing.message_id, v.targetMsgId, v.channel.id ?? existing.channel_id, redact(v.evidence ?? ""));
    if (v.channel.client) await updateCard(v.channel.client, existing);
  }
  if (openingVotes.has(key) || existing) {
    log.info("moderation vote suppressed; active vote exists", {
      action: v.action,
      target: v.targetUserId,
    });
    return "duplicate";
  }
  openingVotes.add(key);
  try {
    if (v.channel.guild && await isBanned(v.channel.guild, v.targetUserId)) return "duplicate";
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
      `\nModerator buttons below. Human users with the Members role who can see this case may react ✅ to ${verb}, ❌ to dismiss. ${n} approvals decide; ${config.dismissVoteThreshold} dismissals close. Staff and protected members cannot be targeted by community votes.`,
    ]
      .filter(Boolean)
      .join("\n");
    const embed = new EmbedBuilder().setTitle(title).setColor(0xff5555).setDescription(desc);
    const voteMsg = await v.channel.send({ embeds: [embed], allowedMentions: SAFE_MENTIONS });
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
    if (v.targetMsgId) banVotes.addEvidence(voteMsg.id, v.targetMsgId, v.channel.id ?? voteMsg.channelId, redact(v.evidence ?? ""));
    await voteMsg.edit?.({ components: buttons(voteMsg.id), allowedMentions: SAFE_MENTIONS });
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
  client: Client, messageId: string, emoji: string, userId: string, add: boolean,
): Promise<void> {
  const previous = reactionQueues.get(messageId) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(() => applyVoteReaction(client, messageId, emoji, userId, add));
  reactionQueues.set(messageId, current);
  try { await current; }
  finally { if (reactionQueues.get(messageId) === current) reactionQueues.delete(messageId); }
}

async function applyVoteReaction(
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
  enforcingVotes.add(messageId);
  try {
  if (Date.now() - vote.created_ts >= config.banVoteTtlMs) {
    await closeCase(client, vote, "Expired without action"); return;
  }
  const guild = await client.guilds.fetch(vote.guild_id);
  const voter = await memberFor(guild, userId);
  if (!await eligibleVoter(client, guild, vote, voter)) return;

  const up = new Set(vote.up);
  const down = new Set(vote.down);
  const set = emoji === "✅" ? up : down;
  if (add) { set.add(userId); (emoji === "✅" ? down : up).delete(userId); }
  else set.delete(userId);
  // Revalidate membership, visibility and target protection before enforcement.
  for (const voters of [up, down]) for (const id of voters) {
    const member = await memberFor(guild, id);
    if (!await eligibleVoter(client, guild, vote, member)) voters.delete(id);
  }
  if (!banVotes.get(messageId)) return;
  banVotes.setVotes(messageId, [...up], [...down]);

  if (up.size >= config.banVoteThreshold) {
    if (await enforce(client, vote)) await closeCase(client, vote, "Approved action completed", userId);
  } else if (down.size >= config.dismissVoteThreshold) {
    await closeCase(client, vote, "Dismissed by eligible voters", userId);
    log.info("moderation vote dismissed", { messageId });
  }
  } finally { enforcingVotes.delete(messageId); }
}

export async function handleModerationButton(interaction: any): Promise<void> {
  if (!interaction.isButton() || !interaction.customId.startsWith("mod:")) return;
  await interaction.deferReply({ flags: 64 });
  const [, action, id, extra] = interaction.customId.split(":");
  const vote = banVotes.get(id);
  if (extra || !["ban", "delete", "dismiss"].includes(action) || !vote ||
      interaction.guildId !== vote.guild_id || interaction.message.id !== vote.message_id ||
      interaction.channelId !== vote.channel_id) {
    await interaction.editReply("This case is closed or unavailable."); return;
  }
  const guild = await interaction.client.guilds.fetch(vote.guild_id);
  const actor = await memberFor(guild, interaction.user.id);
  if (interaction.user.id === vote.target_id || !permitted(actor, action === "dismiss" ? vote.action : action)) {
    await interaction.editReply("You do not have the moderation permission required for this action."); return;
  }
  if (enforcingVotes.has(id)) { await interaction.editReply("An action is already in progress."); return; }
  enforcingVotes.add(id);
  try {
    if (!banVotes.get(id)) { await interaction.editReply("This case is already closed."); return; }
    if (Date.now() - vote.created_ts >= config.banVoteTtlMs) {
      await closeCase(interaction.client, vote, "Expired without action");
      await interaction.editReply("This case has expired."); return;
    }
    if (action === "dismiss") {
      await closeCase(interaction.client, vote, "Dismissed by moderator", actor.id);
    } else {
      if (action === "delete" && !await canDeleteIn(interaction.client, vote.channel_id, actor)) {
        await interaction.editReply("You cannot delete messages in this channel."); return;
      }
      if (action === "ban") {
        if (!await canActOn(guild, actor, vote.target_id, action)) {
          await interaction.editReply("You cannot ban a member at or above your role."); return;
        }
      }
      if (!await enforce(interaction.client, { ...vote, action })) {
        await interaction.editReply("Discord did not confirm the action. The case remains open; check bot permissions."); return;
      }
      if (action === "delete" && vote.action !== "delete") {
        if (vote.target_msg_id) await observeDeletion(interaction.client, vote.target_msg_id);
        await interaction.editReply("Message deleted. The ban proposal remains open."); return;
      }
      await closeCase(interaction.client, vote, action === "ban" ? "Banned by moderator" : "Message deleted", actor.id);
    }
    await interaction.editReply("Case updated.");
  } finally { enforcingVotes.delete(id); }
}

/** Carry out a passed vote: delete the message, or ban/timeout the user. */
async function enforce(client: Client, vote: BanVote): Promise<boolean> {
  try {
    if (vote.action === "delete") {
      const ch = await client.channels.fetch(vote.channel_id).catch(() => null);
      if (!ch || !("messages" in ch) || !vote.target_msg_id) return false;
      {
        const m = await (ch as any).messages.fetch(vote.target_msg_id).catch((error: any) => {
          if (error.code === 10008) return null;
          throw error;
        });
        if (m) {
          if (m.author.id !== vote.target_id) return false;
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
      if (await isBanned(guild, vote.target_id)) return true;
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
