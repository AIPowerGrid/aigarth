import { test } from "node:test";
import assert from "node:assert/strict";
import { openModerationVote, handleVoteReaction, handleModerationButton, reconcileBan, observeDeletion, observeEdit } from "./scam.js";
import { banVotes, db } from "../store/db.js";
import { PermissionFlagsBits } from "discord.js";

test("model-requested ban vote preserves redacted evidence and deduplicates", async () => {
  const payloads: any[] = [];
  const channel = {
    send: async (payload: any) => {
      payloads.push(payload);
      return {
        id: "flash-vote-1",
        channelId: "flash-channel",
        react: async () => {},
      };
    },
  };
  const vote = {
    channel,
    guildId: "flash-guild",
    targetUserId: "flash-user",
    action: "ban" as const,
    reason: "Context indicates support impersonation through @recovery_desk.",
    evidence: "message @recovery_desk immediately https://example.invalid ```spoofed",
    targetMsgId: "flash-source-1",
  };

  const opening = openModerationVote(vote);
  vote.evidence = "";
  assert.equal(await opening, "opened");
  assert.equal(payloads.length, 1);
  const description = payloads[0].embeds[0].data.description as string;
  assert.match(description, /message \[account removed\] immediately \[link removed\]/);
  assert.doesNotMatch(description, /example\.invalid/);
  assert.doesNotMatch(description, /recovery_desk/);
  assert.doesNotMatch(description, /```spoofed/);
  assert.match(description, /needs the Discord `Ban Members` permission/);

  const stored = (await import("../store/db.js")).banVotes.get("flash-vote-1");
  assert.equal(stored?.action, "ban");
  assert.equal(stored?.target_msg_id, "flash-source-1");
  assert.doesNotMatch(stored?.reason ?? "", /recovery_desk/);

  const duplicate = await openModerationVote({ ...vote, targetMsgId: "flash-source-2" });
  assert.equal(duplicate, "duplicate");
  assert.equal(payloads.length, 1);
});

let sequence = 0;
function fixture(action: "ban" | "delete" = "ban") {
  const id = `case-${++sequence}`;
  const replies: string[] = [], edits: any[] = [], bans: string[] = [];
  let allowed = true, alreadyBanned = false, failDelete = false, failBan = false, deleted = 0;
  const actor: any = { id: "mod", user: { bot: false }, permissions: { has: () => allowed }, roles: { highest: { comparePositionTo: () => 1 } } };
  const target: any = { id: "target", user: { bot: false }, roles: { highest: {} } };
  const guild: any = {
    id, ownerId: "owner",
    members: {
      fetch: async ({ user }: any) => user === "target" ? target : { ...actor, id: user },
      ban: async (user: string) => { if (failBan) throw new Error("forbidden"); bans.push(user); alreadyBanned = true; },
    },
    bans: { fetch: async () => { if (!alreadyBanned) throw Object.assign(new Error("unknown ban"), { code: 10026 }); return {}; } },
  };
  const channel: any = { permissionsFor: () => ({ has: () => allowed }), messages: { fetch: async (messageId: string) => messageId === id
    ? { embeds: [], edit: async (p: any) => edits.push(p) }
    : { author: { id: "target" }, delete: async () => { if (failDelete) throw new Error("forbidden"); deleted++; } } } };
  const client: any = { user: { id: "bot" }, guilds: { fetch: async () => guild }, channels: { fetch: async () => channel } };
  banVotes.create(id, id, id, "target", "Reported scam", action, `${id}-source`);
  banVotes.addEvidence(id, `${id}-source`, id, "Original evidence");
  const click = (command: string, changes: any = {}) => handleModerationButton({
    isButton: () => true, customId: `mod:${command}:${id}`, guildId: id, channelId: id,
    message: { id }, user: { id: "mod" }, client,
    deferReply: async () => {}, editReply: async (s: string) => replies.push(s), ...changes,
  });
  return { id, client, actor, target, guild, click, replies, edits, bans,
    deny: () => { allowed = false; }, banned: () => { alreadyBanned = true; },
    failDelete: () => { failDelete = true; }, failBan: () => { failBan = true; }, deleted: () => deleted };
}

test("moderator ban is single-execution and resolves its card", async () => {
  const f = fixture();
  await Promise.all([f.click("ban"), f.click("ban")]);
  assert.equal(f.bans.length, 1);
  assert.equal(banVotes.get(f.id), null);
  assert.deepEqual(f.edits.at(-1).components, []);
  const row: any = db.prepare("SELECT actor_id,outcome FROM ban_votes WHERE message_id = ?").get(f.id);
  assert.equal(row.actor_id, "mod");
  assert.match(row.outcome, /Banned/);
});

test("unprivileged buttons and reactions never count or ban", async () => {
  const f = fixture(); f.deny();
  await f.click("ban");
  for (let i = 0; i < 5; i++) await handleVoteReaction(f.client, f.id, "✅", `voter${i}`, true);
  assert.equal(f.bans.length, 0);
  assert.deepEqual(banVotes.get(f.id)?.up, []);
});

test("forged location and self-target buttons are rejected", async () => {
  const f = fixture();
  await f.click("ban", { guildId: "another" });
  await f.click("ban", { message: { id: "another" } });
  await f.click("ban", { user: { id: "target" } });
  assert.equal(f.bans.length, 0);
});

test("moderator cannot escalate above their role or ban guild owner", async () => {
  const f = fixture();
  f.actor.roles.highest.comparePositionTo = () => 0;
  await f.click("ban");
  assert.equal(f.bans.length, 0);
  f.actor.roles.highest.comparePositionTo = () => 1;
  f.guild.ownerId = "target";
  await f.click("ban");
  assert.equal(f.bans.length, 0);
});

test("external ban closes cases without a second ban", async () => {
  const f = fixture();
  await reconcileBan(f.client, f.id, "target");
  await f.click("ban");
  assert.equal(f.bans.length, 0);
  assert.equal(banVotes.get(f.id), null);
  assert.match(f.edits[0].embeds[0].data.title, /confirmed by Discord/);
});

test("deleting evidence keeps ban case open and immutable", async () => {
  const f = fixture();
  await observeDeletion(f.client, `${f.id}-source`);
  banVotes.addEvidence(f.id, `${f.id}-source`, f.id, "changed text");
  assert.ok(banVotes.get(f.id));
  assert.equal(banVotes.evidence(f.id)[0].content, "Original evidence");
  assert.ok(banVotes.evidence(f.id)[0].deleted_ts);
  await observeEdit(f.client, `${f.id}-source`, "replacement https://malicious.invalid");
  assert.equal(banVotes.evidence(f.id)[0].content, "Original evidence");
  assert.equal(banVotes.evidence(f.id)[0].edited_content, "replacement [link removed]");
});

test("delete button does not implicitly dismiss a ban; failed delete stays open", async () => {
  const f = fixture(); await f.click("delete");
  assert.equal(f.deleted(), 1);
  assert.ok(banVotes.get(f.id));
  const g = fixture("delete"); g.failDelete(); await g.click("delete");
  assert.ok(banVotes.get(g.id));
  assert.match(g.replies.at(-1)!, /did not confirm/);
});

test("failed ban remains actionable; dismissal makes no punitive API call", async () => {
  const f = fixture(); f.failBan(); await f.click("ban");
  assert.ok(banVotes.get(f.id));
  await f.click("dismiss");
  assert.equal(banVotes.get(f.id), null);
  assert.equal(f.bans.length, 0);
});

test("ManageMessages alone cannot ban", async () => {
  const f = fixture(); f.actor.permissions.has = (permission: bigint) => permission === PermissionFlagsBits.ManageMessages;
  await f.click("ban"); assert.equal(f.bans.length, 0);
  await f.click("delete"); assert.equal(f.deleted(), 1);
});

test("stale case cannot authorize an action", async () => {
  const f = fixture();
  db.prepare("UPDATE ban_votes SET created_ts = 0 WHERE message_id = ?").run(f.id);
  await f.click("ban");
  assert.equal(f.bans.length, 0);
  assert.equal(banVotes.get(f.id), null);
});

test("opposite votes are exclusive and revoked permissions invalidate quorum", async () => {
  const f = fixture();
  await handleVoteReaction(f.client, f.id, "✅", "voter", true);
  await handleVoteReaction(f.client, f.id, "❌", "voter", true);
  assert.deepEqual(banVotes.get(f.id)?.up, []);
  assert.deepEqual(banVotes.get(f.id)?.down, ["voter"]);
  banVotes.setVotes(f.id, ["old1", "old2", "old3"], []);
  f.guild.members.fetch = async ({ user }: any) => user === "target" ? f.target : {
    ...f.actor, id: user, permissions: { has: () => !user.startsWith("old") },
  };
  await handleVoteReaction(f.client, f.id, "✅", "new", true);
  assert.deepEqual(banVotes.get(f.id)?.up, ["new"]);
  assert.equal(f.bans.length, 0);
});

test("simultaneous eligible reactions retain quorum and ban only once", async () => {
  const f = fixture();
  await Promise.all(Array.from({ length: 5 }, (_, i) => handleVoteReaction(f.client, f.id, "✅", `trusted${i}`, true)));
  assert.equal(f.bans.length, 1);
  assert.equal(banVotes.get(f.id), null);
});

test("channel overrides deny delete even with a guild-level permission", async () => {
  const f = fixture();
  const channel = await f.client.channels.fetch(f.id);
  channel.permissionsFor = () => ({ has: () => false });
  await f.click("delete");
  assert.equal(f.deleted(), 0);
  assert.match(f.replies.at(-1)!, /cannot delete/);
});

test("passed ban vote remains active after failed enforcement and can be retried", async () => {
  const { banVotes } = await import("../store/db.js");
  const voteId = "retry-vote-1";
  const targetId = "retry-target";
  banVotes.create(voteId, "retry-channel", "retry-guild", targetId, "Retry test.", "ban", null);

  let shouldFail = true;
  const banned: string[] = [];
  const client: any = {
    user: { id: "aigarth" },
    guilds: {
      fetch: async () => ({
        members: {
          fetch: async ({ user }: any) => ({ id: user, user: { bot: false }, permissions: { has: () => true }, roles: { highest: { comparePositionTo: () => 1 } } }),
          ban: async (id: string) => {
            if (shouldFail) throw new Error("Missing Permissions");
            banned.push(id);
          },
        },
        bans: { fetch: async () => { throw Object.assign(new Error("Unknown Ban"), { code: 10026 }); } },
      }),
    },
  };

  for (let i = 0; i < 4; i++) {
    await handleVoteReaction(client, voteId, "✅", `retry-voter-${i}`, true);
  }
  assert.ok(banVotes.get(voteId), "a failed ban must not resolve the vote");

  shouldFail = false;
  await handleVoteReaction(client, voteId, "✅", "retry-voter-4", true);
  assert.deepEqual(banned, [targetId]);
  assert.equal(banVotes.get(voteId), null, "a verified enforcement resolves the vote");
});
