import { PermissionFlagsBits, type Guild } from "discord.js";
import { config } from "../config.js";

/** Read-only preflight. Per-target hierarchy still needs Discord enforcement. */
export async function moderationReadiness(guild: Guild) {
  await guild.roles.fetch();
  const me = await guild.members.fetchMe({ force: true });
  const voterRoles = config.communityVoterRoleIds.map(id => guild.roles.cache.get(id));
  const banPermission = me.permissions.has(PermissionFlagsBits.BanMembers);
  const missingRoles = voterRoles.filter(role => !role).length;
  const aboveMembers = voterRoles.length > 0 && missingRoles === 0 &&
    voterRoles.every(role => me.roles.highest.comparePositionTo(role!) > 0);
  return {
    guild_id: guild.id, ban_permission: banPermission,
    manage_messages_permission: me.permissions.has(PermissionFlagsBits.ManageMessages),
    configured_voter_roles: voterRoles.length, missing_voter_roles: missingRoles,
    above_voter_roles: aboveMembers, community_ban_preflight_ready: banPermission && aboveMembers,
    per_target_hierarchy_required: true,
  };
}
