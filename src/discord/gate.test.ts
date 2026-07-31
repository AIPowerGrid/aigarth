import { test } from "node:test";
import assert from "node:assert/strict";
import { enforceGateInvariants, parseVerdict, shouldUseFullAgent } from "./gate.js";

test("parseVerdict: strict JSON respond / ignore / react / moderate", () => {
  const respond = parseVerdict(
    '{"action":"respond","audience":"bot","needs_tools":false,"reply":"yeah, I’m here","reason":"direct question"}',
  );
  assert.equal(respond?.action, "respond");
  assert.equal(respond?.audience, "bot");
  assert.equal(respond?.needsTools, false);
  assert.equal(respond?.reply, "yeah, I’m here");
  assert.equal(parseVerdict('{"action":"ignore"}')?.action, "ignore");
  const r = parseVerdict('{"action":"react","emoji":"🔥"}');
  assert.equal(r?.action, "react");
  assert.equal(r?.emoji, "🔥");
  const moderate = parseVerdict('{"action":"moderate","reason":"possible impersonation"}');
  assert.equal(moderate?.action, "moderate");
  assert.equal(moderate?.reason, "possible impersonation");
  assert.equal(shouldUseFullAgent(moderate!, "message me on this other account"), true);
});

test("parseVerdict: missing plain reply safely falls back to the full agent", () => {
  const missing = parseVerdict(
    '{"action":"respond","audience":"bot","needs_tools":false,"reply":""}',
  );
  assert.equal(missing?.needsTools, true);
  assert.equal(missing?.reply, undefined);
  assert.equal(parseVerdict('{"action":"respond","audience":"bot"}')?.needsTools, true);
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

test("parseVerdict: invalid audience is not accepted as a judgment", () => {
  assert.equal(
    parseVerdict(
      '{"action":"respond","audience":"everyone","needs_tools":false,"reply":"hello"}',
    ),
    null,
  );
  assert.equal(parseVerdict('{"action":"respond","needs_tools":true}'), null);
});

test("parseVerdict: nothing recognizable → null (caller fails closed to ignore)", () => {
  assert.equal(parseVerdict("banana"), null);
  assert.equal(parseVerdict(""), null);
  assert.equal(parseVerdict(null), null);
});

test("response-mode routing escalates analysis without changing gate action", () => {
  const plain = parseVerdict(
    '{"action":"respond","audience":"bot","needs_tools":false,"reply":"short room-grounded answer"}',
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

test("unaddressed responses fail closed unless the audience is the bot or room", () => {
  const human = { action: "respond" as const, audience: "human" as const, needsTools: false };
  assert.deepEqual(enforceGateInvariants(human, {}), {
    action: "ignore",
    audience: "human",
    reason: "unaddressed focus targets a human or has no clear open audience",
  });

  const missing = { action: "respond" as const, needsTools: false };
  assert.equal(enforceGateInvariants(missing, {}).action, "ignore");

  const room = { action: "respond" as const, audience: "room" as const, needsTools: false };
  assert.deepEqual(enforceGateInvariants(room, {}), room);

  const bot = { action: "respond" as const, audience: "bot" as const, needsTools: false };
  assert.deepEqual(enforceGateInvariants(bot, {}), bot);
});

test("direct addressing remains model-judged without audience enforcement", () => {
  const response = { action: "respond" as const, audience: "human" as const, needsTools: false };
  assert.deepEqual(enforceGateInvariants(response, { mentioned: true }), response);
  assert.deepEqual(enforceGateInvariants(response, { repliedToBot: true }), response);
  assert.deepEqual(enforceGateInvariants(response, { named: true }), response);
  assert.deepEqual(enforceGateInvariants(response, { isDM: true }), response);
});
