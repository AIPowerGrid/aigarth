import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVerdict } from "./gate.js";

test("parseVerdict: RESPOND / IGNORE / REACT <emoji>", () => {
  assert.equal(parseVerdict("RESPOND")?.action, "respond");
  assert.equal(parseVerdict("ignore")?.action, "ignore");
  const r = parseVerdict("REACT 🔥");
  assert.equal(r?.action, "react");
  assert.equal(r?.emoji, "🔥");
});

test("parseVerdict: REACT without an emoji defaults to 👍", () => {
  const r = parseVerdict("react");
  assert.equal(r?.action, "react");
  assert.equal(r?.emoji, "👍");
});

test("parseVerdict: finds the verdict embedded in reasoning text", () => {
  assert.equal(parseVerdict("hmm, I think RESPOND makes sense here")?.action, "respond");
});

test("parseVerdict: nothing recognizable → null (caller fails closed to ignore)", () => {
  assert.equal(parseVerdict("banana"), null);
  assert.equal(parseVerdict(""), null);
  assert.equal(parseVerdict(null), null);
});
