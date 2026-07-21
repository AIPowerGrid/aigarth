import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVerdict } from "./gate.js";

test("parseVerdict: strict JSON respond / ignore / react", () => {
  assert.equal(parseVerdict('{"action":"respond","reason":"direct question"}')?.action, "respond");
  assert.equal(parseVerdict('{"action":"ignore"}')?.action, "ignore");
  const r = parseVerdict('{"action":"react","emoji":"🔥"}');
  assert.equal(r?.action, "react");
  assert.equal(r?.emoji, "🔥");
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
