import { test } from "node:test";
import assert from "node:assert/strict";
import { messages, redactStoredContent, userMemory } from "./db.js";

test("durable transcript redacts credential-shaped values", () => {
  const redacted = redactStoredContent(
    "api key: sk-abcdefghijklmnop and password=hunter2 plus Bearer abc.def.ghi",
  );
  assert.doesNotMatch(redacted, /abcdefghijklmnop|hunter2|abc\.def\.ghi/);
  assert.match(redacted, /redacted/);
});

test("fresh history excludes only the trigger and includes later chatter", () => {
  const channel = "history-refresh";
  messages.add(channel, "alice", "before", "u1", false, "m1");
  messages.add(channel, "alice", "please answer this", "u1", false, "trigger");
  messages.add(channel, "bob", "intervening context", "u2", false, "m3");

  const history = messages.formatRecent(channel, {
    limit: 20,
    maxChars: 24000,
    excludeMessageId: "trigger",
  });
  assert.match(history, /before/);
  assert.match(history, /intervening context/);
  assert.doesNotMatch(history, /please answer this/);
});

test("Discord synchronization updates a stable message instead of duplicating it", () => {
  const channel = "history-sync";
  messages.sync(channel, "alice", "original text", "u1", false, "discord-1", 1000);
  messages.sync(channel, "alice", "edited text [reactions: ✅×2]", "u1", false, "discord-1", 2000);

  const rows = messages.recent(channel, 20);
  assert.equal(rows.filter((row) => row.message_id === "discord-1").length, 1);
  assert.equal(rows.find((row) => row.message_id === "discord-1")?.content, "edited text [reactions: ✅×2]");
  assert.equal(rows.find((row) => row.message_id === "discord-1")?.ts, 2000);
});

test("history character budget keeps the newest messages", () => {
  const channel = "history-budget";
  messages.add(channel, "alice", "old ".repeat(100), "u1", false, "b1");
  messages.add(channel, "bob", "newest context", "u2", false, "b2");
  const history = messages.formatRecent(channel, { limit: 20, maxChars: 80 });
  assert.doesNotMatch(history, /old old/);
  assert.match(history, /newest context/);
});

test("summary batches preserve the recent verbatim window", () => {
  const channel = "summary-batch";
  for (let i = 1; i <= 6; i++) messages.add(channel, "alice", `message ${i}`, "u1", false, `s${i}`);
  const batch = messages.summaryBatch(channel, 0, 2, 24000, 20);
  assert.equal(batch.count, 4);
  assert.match(batch.transcript, /message 1/);
  assert.match(batch.transcript, /message 4/);
  assert.doesNotMatch(batch.transcript, /message 5/);
});

test("messages omitted by the character budget remain eligible for summary", () => {
  const channel = "summary-char-budget";
  for (let i = 1; i <= 6; i++) messages.add(channel, "alice", `long ${i} `.repeat(20), "u1", false, `c${i}`);
  const batch = messages.summaryBatch(channel, 0, 20, 180, 20);
  assert.equal(batch.count, 5);
  assert.match(batch.transcript, /long 1/);
  assert.doesNotMatch(batch.transcript, /long 6/);
});

test("memory opt-out clears facts and prevents new writes", () => {
  const user = "memory-user";
  userMemory.add(user, "alice", "runs a 4090 worker", 30);
  assert.deepEqual(userMemory.list(user), ["runs a 4090 worker"]);
  userMemory.setEnabled(user, false);
  assert.equal(userMemory.clear(user), 1);
  userMemory.add(user, "alice", "builds a media app", 30);
  assert.deepEqual(userMemory.list(user), []);
  userMemory.setEnabled(user, true);
  userMemory.add(user, "alice", "builds a media app", 30);
  assert.deepEqual(userMemory.list(user), ["builds a media app"]);
});
