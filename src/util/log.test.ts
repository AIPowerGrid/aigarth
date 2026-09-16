import { test } from "node:test";
import assert from "node:assert/strict";
import { log, withLogContext } from "./log.js";
test("concurrent turn scopes keep their own correlation on stdout and stderr", async () => {
  const lines: any[] = [];
  const out = console.log, err = console.error;
  console.log = console.error = (s: string) => lines.push(JSON.parse(s));
  try {
    await Promise.all(["a", "b"].map(id => withLogContext({ turn_id: id, message_id: `m-${id}`, channel_id: id }, async () => {
      await new Promise(r => setTimeout(r, id === "a" ? 5 : 1));
      log.info("test", { expected: id });
      log.warn("test warning", { expected: id });
    })));
    log.info("outside");
  } finally { console.log = out; console.error = err; }
  for (const row of lines.filter(r => r.expected)) {
    assert.equal(row.turn_id, row.expected); assert.equal(row.message_id, `m-${row.expected}`);
  }
  assert.equal(lines.at(-1).turn_id, undefined);
});
