import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEditedReply } from "./replyEditor.js";

test("parseEditedReply accepts strict JSON, including intentional silence", () => {
  assert.equal(parseEditedReply('{"reply":"yeah, I’m here"}'), "yeah, I’m here");
  assert.equal(parseEditedReply('{"reply":""}'), "");
  assert.equal(parseEditedReply('```json\n{"reply":"short answer"}\n```'), "short answer");
});

test("parseEditedReply rejects narration and malformed values", () => {
  assert.equal(parseEditedReply('Here: {"reply":"hello"}'), null);
  assert.equal(parseEditedReply('{"reply":42}'), null);
  assert.equal(parseEditedReply("not json"), null);
});
