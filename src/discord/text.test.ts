import { test } from "node:test";
import assert from "node:assert/strict";
import { unwrapToolCallText, stripImageMarkdown, chunk } from "./text.js";

test("unwrapToolCallText: leaves normal text alone", () => {
  assert.equal(unwrapToolCallText("hey what's up"), "hey what's up");
  assert.equal(unwrapToolCallText("here's a {curly} brace but not json"), "here's a {curly} brace but not json");
});

test("unwrapToolCallText: extracts inner text from a leaked reply tool-call", () => {
  const leaked = '{"tool":"functions.reply","args":{"text":"BTC is $60k"}}';
  assert.equal(unwrapToolCallText(leaked), "BTC is $60k");
});

test("unwrapToolCallText: handles a ```json fenced tool-call", () => {
  const leaked = '```json\n{"name":"reply","arguments":{"text":"hello there"}}\n```';
  assert.equal(unwrapToolCallText(leaked), "hello there");
});

test("unwrapToolCallText: tolerates alternate arg shapes", () => {
  assert.equal(unwrapToolCallText('{"parameters":{"text":"via parameters"}}'), "via parameters");
  assert.equal(unwrapToolCallText('{"text":"bare text field"}'), "bare text field");
});

test("unwrapToolCallText: invalid JSON falls through unchanged", () => {
  const notJson = '{"text": broken';
  assert.equal(unwrapToolCallText(notJson), notJson);
});

test("stripImageMarkdown: removes image embeds + attachment refs, unwraps JSON", () => {
  assert.equal(stripImageMarkdown("look ![alt](http://x/y.png) here"), "look  here");
  assert.equal(stripImageMarkdown("see attachment://foo.png"), "see");
  assert.equal(stripImageMarkdown('{"args":{"text":"unwrapped then trimmed"}}'), "unwrapped then trimmed");
  // normal links survive
  assert.equal(stripImageMarkdown("visit [site](http://x)"), "visit [site](http://x)");
});

test("chunk: splits over the size limit, empty → []", () => {
  assert.deepEqual(chunk(""), []);
  assert.deepEqual(chunk("short"), ["short"]);
  const parts = chunk("a".repeat(4001), 1900);
  assert.equal(parts.length, 3);
  assert.equal(parts.join("").length, 4001);
});
