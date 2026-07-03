import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanArg } from "./crypto.js";

test("cleanArg: strips leaked tool-call tags (the qwen </parameter> bug)", () => {
  assert.equal(cleanArg("bitcoin\n</parameter>", true), "bitcoin");
  assert.equal(cleanArg("<parameter>ethereum</parameter>", true), "ethereum");
  assert.equal(cleanArg('"ai-power-grid"', true), "ai-power-grid");
});

test("cleanArg: singleToken keeps the first token; otherwise preserves the phrase", () => {
  assert.equal(cleanArg("bitcoin foo", true), "bitcoin");
  assert.equal(cleanArg("ai power grid</parameter>"), "ai power grid");
  assert.equal(cleanArg("  trimmed  "), "trimmed");
});

test("cleanArg: null/undefined → empty string", () => {
  assert.equal(cleanArg(null), "");
  assert.equal(cleanArg(undefined, true), "");
});
