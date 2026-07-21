import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSummary } from "./conversationSummary.js";
import { parseExtractedFacts } from "./memoryExtraction.js";

test("normalizeSummary strips a fence and enforces the configured budget", () => {
  assert.equal(normalizeSummary("```text\nProject Atlas uses two workers.\n```"), "Project Atlas uses two workers.");
});

test("parseExtractedFacts accepts strict JSON and caps the result", () => {
  assert.deepEqual(
    parseExtractedFacts('{"facts":["runs two image workers","prefers concise status reports","ignored third fact"]}'),
    ["runs two image workers", "prefers concise status reports"],
  );
});

test("parseExtractedFacts rejects narration and malformed output", () => {
  assert.deepEqual(parseExtractedFacts('I think {"facts":["runs a worker"]}'), []);
  assert.deepEqual(parseExtractedFacts('{"facts":"runs a worker"}'), []);
});
