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

test("every message in a burst reaches the agent", async () => {
  const seen: string[] = [];
  const c = createCoalescer({ run: async (a) => void seen.push(a.content), settleMs: 40, settleAddressedMs: 10 });
  c.noteActivity(act("c1", false, "m1"));
  c.noteActivity(act("c1", false, "m2"));
  c.noteActivity(act("c1", false, "m3"));
  await sleep(170);
  assert.deepEqual(seen, ["m1", "m2", "m3"]);
});

test("addressing does not drop other human messages", async () => {
  const seen: string[] = [];
  const c = createCoalescer({ run: async (a) => void seen.push(a.content), settleMs: 40, settleAddressedMs: 40 });
  c.noteActivity(act("c1", true, "mention"));
  c.noteActivity(act("c1", false, "chatter1"));
  c.noteActivity(act("c1", false, "chatter2"));
  await sleep(170);
  assert.deepEqual(seen, ["mention", "chatter1", "chatter2"]);
});

test("a flash-deleted message gets a protected review slot", async () => {
  const seen: string[] = [];
  const c = createCoalescer({ run: async (a) => void seen.push(a.content), settleMs: 40, settleAddressedMs: 40 });
  const deleted = act("c1", false, "deleted");
  deleted.deleted = true;
  c.noteActivity(deleted);
  c.noteActivity(act("c1", false, "later chatter"));
  await sleep(120);
  assert.deepEqual(seen, ["deleted", "later chatter"]);
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

test("duplicate pending events are deduplicated without losing a deletion event", async () => {
  const seen: string[] = [];
  const c = createCoalescer({ run: async (a) => void seen.push(a.content), settleMs: 10, settleAddressedMs: 10 });
  const a = act("c1", false, "m1");
  (a.message as any).id = "1";
  c.noteActivity(a);
  c.noteActivity(a);
  c.noteActivity({ ...a, deleted: true, content: "deleted m1" });
  await sleep(60);
  assert.deepEqual(seen, ["m1", "deleted m1"]);
});
