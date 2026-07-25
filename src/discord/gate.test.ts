import { test } from "node:test";
import assert from "node:assert/strict";
import { enforceGateInvariants, parseVerdict, shouldUseFullAgent } from "./gate.js";

test("parseVerdict: strict JSON respond / ignore / react", () => {
  const respond = parseVerdict(
    '{"action":"respond","needs_tools":false,"reply":"yeah, I’m here","reason":"direct question"}',
  );
  assert.equal(respond?.action, "respond");
  assert.equal(respond?.needsTools, false);
  assert.equal(respond?.reply, "yeah, I’m here");
  assert.equal(parseVerdict('{"action":"ignore"}')?.action, "ignore");
  const r = parseVerdict('{"action":"react","emoji":"🔥"}');
  assert.equal(r?.action, "react");
  assert.equal(r?.emoji, "🔥");
});

test("parseVerdict: missing plain reply safely falls back to the full agent", () => {
  const missing = parseVerdict('{"action":"respond","needs_tools":false,"reply":""}');
  assert.equal(missing?.needsTools, true);
  assert.equal(missing?.reply, undefined);
  assert.equal(parseVerdict('{"action":"respond"}')?.needsTools, true);
});

test("parseVerdict: fenced JSON is accepted and a missing react emoji defaults", () => {
  const r = parseVerdict('```json\n{"action":"react"}\n```');
  assert.equal(r?.action, "react");
  assert.equal(r?.emoji, "👍");
});

test("parseVerdict: narrated or conflicting output is rejected", () => {
  assert.equal(parseVerdict("hmm, I think RESPOND makes sense here"), null);
  assert.equal(parseVerdict('{"action":"RESPOND"}'), null);
  assert.equal(parseVerdict('{"action":"ignore"} trailing'), null);
});

test("parseVerdict: nothing recognizable → null (caller fails closed to ignore)", () => {
  assert.equal(parseVerdict("banana"), null);
  assert.equal(parseVerdict(""), null);
  assert.equal(parseVerdict(null), null);
});

test("response-mode routing escalates analysis without changing gate action", () => {
  const plain = parseVerdict(
    '{"action":"respond","needs_tools":false,"reply":"short room-grounded answer"}',
  )!;
  assert.equal(shouldUseFullAgent(plain, "which GPU did Bob mention?"), false);
  assert.equal(shouldUseFullAgent(plain, "what do you think about those constraints?"), true);
  assert.equal(shouldUseFullAgent(plain, "why is the worker disconnecting?"), true);
  assert.equal(shouldUseFullAgent({ action: "ignore" }, "what do you think?"), false);
});

test("a stale focus can never receive a reaction", () => {
  const reaction = { action: "react" as const, emoji: "👍", reason: "acknowledge thanks" };
  assert.deepEqual(enforceGateInvariants(reaction, { focusIsLatest: false }), {
    action: "ignore",
    reason: "a reaction cannot be attached to a stale focus",
  });
  assert.deepEqual(enforceGateInvariants(reaction, { focusIsLatest: true }), reaction);
});
