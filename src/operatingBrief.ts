import { readDoc } from "./docs/store.js";

/** The review date describes a snapshot, never a live-status guarantee. */
export function briefSnapshot(text = readDoc("operating-brief.md"), now = Date.now()) {
  const date = text?.split("\n").find(line => line.startsWith("Reviewed: "))?.slice(10, 20);
  const reviewed = date ? Date.parse(`${date}T00:00:00Z`) : NaN;
  const valid = Number.isFinite(reviewed) && reviewed <= now;
  const ageHours = valid ? Math.floor((now - reviewed) / 3600_000) : null;
  return { text: text?.slice(0, 4000) ?? "Operating brief unavailable.",
    reviewedDate: valid ? date : null, ageHours,
    stale: ageHours === null || ageHours >= 48, authority: "historical_snapshot_not_live_status" };
}
