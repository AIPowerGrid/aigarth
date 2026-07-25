import { test } from "node:test";
import assert from "node:assert/strict";
import { openModerationVote, handleVoteReaction } from "./scam.js";

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
          ban: async (id: string) => {
            if (shouldFail) throw new Error("Missing Permissions");
            banned.push(id);
          },
        },
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
