import { test } from "node:test";
import assert from "node:assert/strict";
import { moderationReadiness } from "./readiness.js";
import { config } from "../config.js";
import { PermissionFlagsBits } from "discord.js";

test("readiness requires ban permission AND a bot role above configured Members", async () => {
  config.communityVoterRoleIds = ["members"];
  let ban = false, above = true;
  const guild: any = { id: "guild", roles: { fetch: async () => {}, cache: new Map([["members", {}]]) },
    members: { fetchMe: async () => ({ permissions: { has: (p: bigint) => p !== PermissionFlagsBits.BanMembers || ban },
      roles: { highest: { comparePositionTo: () => above ? 1 : -1 } } }) } };
  assert.equal((await moderationReadiness(guild)).community_ban_preflight_ready, false);
  ban = true;
  assert.equal((await moderationReadiness(guild)).community_ban_preflight_ready, true);
  above = false;
  assert.equal((await moderationReadiness(guild)).community_ban_preflight_ready, false);
  above = true; guild.roles.cache.clear();
  assert.equal((await moderationReadiness(guild)).community_ban_preflight_ready, false);
});
