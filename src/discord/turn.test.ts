import { test } from "node:test";
import assert from "node:assert/strict";
import { processActivity } from "./turn.js";
import type { Activity } from "./coalescer.js";
import type { RoomContext } from "./context.js";
import type { TurnResult } from "../agent.js";
import { config } from "../config.js";

config.autoMemoryEnabled = false;
const metrics = { modelMs: 20, toolMs: 5, modelCalls: 2, toolCalls: 1, contextRefreshes: 0 };
const room: RoomContext = { transcript: "Alice: question", latestMessageId: "focus", focusIsLatest: true,
  messagesAfterFocus: 0, visibleCount: 1, source: "discord" };
function fixture() {
  let sends = 0;
  const channel: any = { id: "channel", lastMessageId: "focus", sendTyping: async () => {},
    send: async () => { sends++; channel.lastMessageId = `sent-${sends}`; return { id: channel.lastMessageId, channelId: "channel" }; } };
  const message: any = { id: "focus", channelId: "channel", channel, content: "PRIVATE MESSAGE",
    createdTimestamp: Date.now() - 5000, author: { id: "alice", username: "Alice" }, reply: channel.send };
  const act = { message, modTarget: message, content: "PRIVATE MESSAGE", respondable: true,
    inTracked: false, traceId: "test-turn", receivedAt: Date.now() - 3000,
    enqueuedAt: Date.now() - 2000, queueDepth: 2, imageUrls: [] } as unknown as Activity;
  return { act, channel, sends: () => sends, client: { user: { id: "bot" } } as any };
}
async function capture(run: () => Promise<void>) {
  const lines: any[] = [];
  const original = console.log, originalError = console.error;
  console.log = console.error = (s: string) => lines.push(JSON.parse(s));
  try { await run(); } finally { console.log = original; console.error = originalError; }
  return lines;
}

for (const expected of ["silent", "replied", "failed", "superseded"] as const) {
  test(`turn produces exactly one correlated terminal record for ${expected}`, async () => {
    const f = fixture();
    const lines = await capture(() => processActivity(f.client, f.act, {
      getRoom: async () => ({ ...room }),
      runAgent: async () => {
        if (expected === "superseded") f.channel.lastMessageId = "new-human-message";
        return { finalText: expected === "silent" ? "" : "hello", images: [], delivery: "channel",
          error: expected === "failed", decision: expected === "silent" ? "silent" : "reply",
          failureReason: expected === "failed" ? "timeout" : undefined, metrics };
      },
    }));
    const terminal = lines.filter(r => r.msg === "turn finished");
    assert.equal(terminal.length, 1);
    assert.equal(terminal[0].outcome, expected);
    assert.equal(terminal[0].turn_id, "test-turn");
    assert.equal(terminal[0].message_id, "focus");
    assert.ok(terminal[0].queue_ms >= 2000);
    assert.equal(terminal[0].model_ms, 20);
    assert.equal(terminal[0].tool_ms, 5);
    assert.equal(f.sends(), expected === "replied" ? 1 : 0);
    assert.ok(!JSON.stringify(lines).includes("PRIVATE MESSAGE"));
  });
}

test("context-fetch exceptions still finish the trace without raw error data", async () => {
  const f = fixture();
  const lines = await capture(() => processActivity(f.client, f.act, {
    getRoom: async () => { throw new Error("secret-token-should-not-be-logged"); },
  }));
  assert.equal(lines.filter(r => r.msg === "turn finished").length, 1);
  assert.equal(lines.at(-1).outcome, "failed");
  assert.ok(!JSON.stringify(lines).includes("secret-token"));
});

test("latest conversation is supplied to same agent before choosing silence", async () => {
  const f = fixture(); let reads = 0;
  const lines = await capture(() => processActivity(f.client, f.act, {
    getRoom: async () => ++reads === 1 ? { ...room } : { ...room, transcript: "Bob answered Alice",
      focusIsLatest: false, messagesAfterFocus: 1 },
    runAgent: async context => {
      assert.equal(await context.refreshContext!(), "Bob answered Alice");
      return { finalText: "", images: [], delivery: "channel", error: false, decision: "silent", metrics };
    },
  }));
  assert.equal(f.sends(), 0);
  assert.equal(lines.at(-1).context_refreshes, 1);
  assert.equal(lines.find(r => r.msg === "turn context refreshed").messages_after_focus, 1);
});

test("read-only moderation failures are failed, not intentional silence", async () => {
  const f = fixture(); f.act.respondable = false;
  const lines = await capture(() => processActivity(f.client, f.act, {
    getRoom: async () => ({ ...room }),
    runAgent: async () => ({ finalText: "", images: [], delivery: "channel", error: true,
      failureReason: "missing_finish", metrics } as TurnResult),
  }));
  assert.equal(lines.at(-1).outcome, "failed");
  assert.equal(lines.at(-1).failure_reason, "missing_finish");
});
