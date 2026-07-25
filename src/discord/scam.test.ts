import { test } from "node:test";
import assert from "node:assert/strict";
import {
  screenMessage,
  hasUntrustedLink,
  openBanVote,
  handleVoteReaction,
} from "./scam.js";

test("screenMessage: flags unofficial Discord invites but allows AIPG's published invite", () => {
  assert.equal(screenMessage("join support https://discord.gg/abc123").flagged, true);
  assert.equal(screenMessage("discord.gg/another-server").flagged, true);
  assert.equal(screenMessage("join us https://discord.gg/W9D8j6HCtC").flagged, false);
});

test("screenMessage: flags support impersonation with a non-AIPG destination", () => {
  assert.equal(
    screenMessage("Contact official support at https://aipg-helpdesk.example/verify").flagged,
    true,
  );
  assert.equal(
    screenMessage("Resolve your issue here: https://ticket-center.example", {
      authorName: "AI Power Grid Support",
    }).flagged,
    true,
  );
  assert.equal(
    screenMessage("For support use https://aipowergrid.io/docs").flagged,
    false,
  );
  assert.equal(
    screenMessage("For support join https://t.me/aipowergrid").flagged,
    false,
  );
  assert.equal(
    screenMessage("I need help debugging https://paste.example/log").flagged,
    false,
  );
  assert.equal(
    screenMessage("Contact support at https://external-ticket.example", {
      authorName: "AIPG Moderator",
      trustedAuthor: true,
    }).flagged,
    false,
  );
});

test("screenMessage: flags wallet-drainer phrasing + an untrusted link", () => {
  assert.equal(screenMessage("claim your airdrop now at http://sketchy-airdrop.xyz/go").flagged, true);
  assert.equal(screenMessage("connect your wallet at https://aipg.art").flagged, false);
});

test("screenMessage: leaves normal messages (incl. trusted links) alone", () => {
  assert.equal(screenMessage("hey how's the grid today").flagged, false);
  assert.equal(screenMessage("read the docs: https://aipowergrid.io/docs").flagged, false);
  // drainer phrasing WITHOUT a link is not enough (fail-closed on uncertainty)
  assert.equal(screenMessage("i wish i could claim your airdrop lol").flagged, false);
});

test("hasUntrustedLink: unknown host true; allowlisted / no link false", () => {
  assert.equal(hasUntrustedLink("check http://totally-legit-airdrop.xyz"), true);
  assert.equal(hasUntrustedLink("see https://github.com/AIPowerGrid/aigarth"), false);
  assert.equal(hasUntrustedLink("no links here at all"), false);
});

test("openBanVote preserves redacted evidence after a flash deletion and deduplicates", async () => {
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
  const message: any = {
    id: "flash-source-1",
    content: "Official support: https://steal-wallet.example/connect or discord.gg/evil ```spoofed",
    guild: { id: "flash-guild" },
    author: { id: "flash-user" },
    channel,
  };

  const opening = openBanVote(message, "Support impersonation.");
  message.content = "";
  assert.equal(await opening, "opened");
  assert.equal(payloads.length, 1);
  const description = payloads[0].embeds[0].data.description as string;
  assert.match(description, /Official support: \[link removed\]/);
  assert.doesNotMatch(description, /steal-wallet/);
  assert.match(description, /\[Discord invite removed\]/);
  assert.doesNotMatch(description, /discord\.gg/);
  assert.doesNotMatch(description, /```spoofed/);
  assert.match(description, /needs the Discord `Ban Members` permission/);

  const vote = (await import("../store/db.js")).banVotes.get("flash-vote-1");
  assert.equal(vote?.action, "ban");
  assert.equal(vote?.target_msg_id, "flash-source-1");

  const duplicate = await openBanVote(
    { ...message, id: "flash-source-2", content: "https://discord.gg/evil" },
    "Second scam post.",
  );
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
