import { test } from "node:test";
import assert from "node:assert/strict";
import { screenMessage, hasUntrustedLink } from "./scam.js";

test("screenMessage: flags a Discord invite link", () => {
  assert.equal(screenMessage("join us https://discord.gg/abc123").flagged, true);
});

test("screenMessage: flags wallet-drainer phrasing + an untrusted link", () => {
  assert.equal(screenMessage("claim your airdrop now at http://sketchy-airdrop.xyz/go").flagged, true);
});

test("screenMessage: leaves normal messages (incl. trusted links) alone", () => {
  assert.equal(screenMessage("hey how's the grid today").flagged, false);
  assert.equal(screenMessage("read the docs: https://aipowergrid.io/docs").flagged, false);
  // drainer phrasing WITHOUT a link is not enough (fail-closed on uncertainty)
  assert.equal(screenMessage("i wish i could claim your airdrop lol").flagged, false);
});

test("hasUntrustedLink: unknown host true; allowlisted / no link false", () => {
  assert.equal(hasUntrustedLink("check http://totally-legit-airdrop.xyz"), true);
  assert.equal(hasUntrustedLink("see https://github.com/AIPowerGrid/aigarth"), false);
  assert.equal(hasUntrustedLink("no links here at all"), false);
});
