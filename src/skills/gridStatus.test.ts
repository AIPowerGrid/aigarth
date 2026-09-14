import { test } from "node:test";
import assert from "node:assert/strict";
import { publicSnapshot, makeGridStatusTool, makeReleaseInfoTool, makeValidatorStatusTool } from "./gridStatus.js";

test("public snapshots send no credential and explicitly distinguish unknown", async t => {
  t.mock.method(globalThis, "fetch", async (_url: any, options: any) => {
    assert.equal(options.redirect, "error");
    assert.deepEqual(options.headers, { Accept: "application/json" });
    return new Response("not found", { status: 404 });
  });
  const value = await publicSnapshot("https://example.com");
  assert.equal(value.available, false); assert.equal(value.http_status, 404);
  assert.equal(value.untrusted_data, undefined); assert.ok(value.fetched_at);
});
test("capability query uses v1, preserving false without inventing zeros", async t => {
  t.mock.method(globalThis, "fetch", async (url: any) => {
    assert.ok(String(url).endsWith("/v1/validator/capabilities"));
    return Response.json({ text_fidelity: { enabled: false } });
  });
  const r = await makeGridStatusTool().execute("x", { view: "validator_capabilities" });
  const data = JSON.parse((r.content[0] as any).text);
  assert.equal(data.untrusted_data.text_fidelity.enabled, false);
  assert.equal(data.untrusted_data.workers, undefined);
});
test("oversized or malformed public data stays unavailable", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("x".repeat(256001)));
  assert.equal((await publicSnapshot("https://example.com")).available, false);
});
test("release tool includes previews and excludes drafts", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json([
    { tag_name: "preview.20", prerelease: true, draft: false, html_url: "https://github.com/example" },
    { tag_name: "unpublished", draft: true },
  ]));
  const r = await makeReleaseInfoTool().execute("x", { repository: "grid-validator" });
  const data = JSON.parse((r.content[0] as any).text);
  assert.equal(data.untrusted_data.length, 1);
  assert.equal(data.untrusted_data[0].prerelease, true);
});
test("public tools reject arbitrary repositories and path injection", async () => {
  await assert.rejects(makeReleaseInfoTool().execute("x", { repository: "../private" }));
  await assert.rejects(makeValidatorStatusTool().execute("x", { validator_id: "../../accounts" }));
});
