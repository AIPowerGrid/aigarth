import { test } from "node:test";
import assert from "node:assert/strict";
import { createCoalescer, type Activity } from "./coalescer.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const act = (channelId: string, addressed: boolean, tag: string): Activity =>
  ({ message: { channelId }, addressed, content: tag }) as unknown as Activity;

test("runs one turn per activity after the settle window", async () => {
  const seen: string[] = [];
  const c = createCoalescer({ run: async (a) => void seen.push(a.content), settleMs: 30, settleAddressedMs: 10 });
  c.noteActivity(act("c1", false, "m1"));
  assert.deepEqual(seen, [], "not before settle");
  await sleep(60);
  assert.deepEqual(seen, ["m1"]);
});

test("newest unaddressed wins — a burst coalesces into one turn on the latest state", async () => {
  const seen: string[] = [];
  const c = createCoalescer({ run: async (a) => void seen.push(a.content), settleMs: 40, settleAddressedMs: 10 });
  c.noteActivity(act("c1", false, "m1"));
  c.noteActivity(act("c1", false, "m2"));
  c.noteActivity(act("c1", false, "m3"));
  await sleep(70);
  assert.deepEqual(seen, ["m3"]);
});

test("a pending ADDRESSED message is sticky — later chatter can't bury an @-mention", async () => {
  const seen: string[] = [];
  const c = createCoalescer({ run: async (a) => void seen.push(a.content), settleMs: 40, settleAddressedMs: 40 });
  c.noteActivity(act("c1", true, "mention"));
  c.noteActivity(act("c1", false, "chatter1"));
  c.noteActivity(act("c1", false, "chatter2"));
  await sleep(70);
  assert.deepEqual(seen, ["mention"]); // the dropped-mention bug we fixed
});

test("a flash-deleted message gets a protected review slot", async () => {
  const seen: string[] = [];
  const c = createCoalescer({ run: async (a) => void seen.push(a.content), settleMs: 40, settleAddressedMs: 40 });
  const deleted = act("c1", false, "deleted");
  deleted.deleted = true;
  c.noteActivity(deleted);
  c.noteActivity(act("c1", false, "later chatter"));
  await sleep(70);
  assert.deepEqual(seen, ["deleted"]);
});

test("serialized per channel — never concurrent, re-runs for activity that arrived mid-turn", async () => {
  const seen: string[] = [];
  let inFlight = 0;
  let maxConcurrent = 0;
  const c = createCoalescer({
    run: async (a) => {
      inFlight++;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await sleep(40);
      seen.push(a.content);
      inFlight--;
    },
    settleMs: 10,
    settleAddressedMs: 10,
  });
  c.noteActivity(act("c1", false, "first"));
  await sleep(25); // first turn is now running
  c.noteActivity(act("c1", false, "second")); // arrives mid-turn
  await sleep(140);
  assert.equal(maxConcurrent, 1, "one turn at a time");
  assert.deepEqual(seen, ["first", "second"], "second ran after first finished");
});

test("channels are independent — a slow channel doesn't block another", async () => {
  const seen: string[] = [];
  const c = createCoalescer({
    run: async (a) => {
      if (a.content === "slow") await sleep(70);
      seen.push(a.content);
    },
    settleMs: 10,
    settleAddressedMs: 10,
  });
  c.noteActivity(act("slowCh", false, "slow"));
  c.noteActivity(act("fastCh", false, "fast"));
  await sleep(45);
  assert.deepEqual(seen, ["fast"], "fast channel didn't wait on the slow one");
  await sleep(70);
  assert.deepEqual([...seen].sort(), ["fast", "slow"]);
});

test("snoozed channel — the turn is skipped", async () => {
  const seen: string[] = [];
  const c = createCoalescer({ run: async (a) => void seen.push(a.content), settleMs: 10, settleAddressedMs: 10 });
  c.snooze("c1", 10_000);
  c.noteActivity(act("c1", false, "m1"));
  await sleep(40);
  assert.deepEqual(seen, []);
  assert.equal(c.isSnoozed("c1"), true);
  assert.equal(c.isSnoozed("other"), false);
});
