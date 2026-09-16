import { test } from "node:test";
import assert from "node:assert/strict";
import { briefSnapshot } from "./operatingBrief.js";
test("brief carries review age and becomes stale without claiming live authority", () => {
  const text = "Reviewed: 2026-09-16 UTC.\nSnapshot only";
  assert.equal(briefSnapshot(text, Date.parse("2026-09-16T01:00Z")).stale, false);
  assert.equal(briefSnapshot(text, Date.parse("2026-09-18T00:00Z")).stale, true);
  assert.equal(briefSnapshot(text, Date.parse("2026-09-18T00:00Z")).ageHours, 48);
  assert.equal(briefSnapshot(text).authority, "historical_snapshot_not_live_status");
});
test("missing, malformed and future review dates fail stale with bounded content", () => {
  for (const text of ["", "Reviewed: nonsense", "Reviewed: 2099-01-01"]) {
    assert.equal(briefSnapshot(text, Date.parse("2026-09-16T00:00Z")).stale, true);
  }
  assert.equal(briefSnapshot("x".repeat(5000)).text.length, 4000);
});
