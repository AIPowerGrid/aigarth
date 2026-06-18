/**
 * End-to-end smoke test: run ONE real prompt through the actual agent path
 * (runTurn → pi → grid → worker) and assert a non-empty, non-error reply.
 *
 * This is the test whose absence let "No API key for provider" ship silently.
 * Run after any change to the agent/grid wiring:  npm run smoke
 * Exits 0 on a real reply, 1 on empty/error.
 */
import { runTurn } from "./agent.js";

const r = await runTurn({
  channelId: "smoke",
  channelName: "smoke",
  userId: "smoke",
  userName: "tester",
  text: "Reply with a short friendly hello.",
  addressed: true,
});

console.log("reply:", JSON.stringify(r.text));
console.log("error:", r.error, "| images:", r.images.length, "| reacted:", r.reacted);

if (r.error || !r.text) {
  console.error("❌ SMOKE FAIL — agent returned empty/error (brain not reachable?)");
  process.exit(1);
}
console.log("✅ SMOKE OK — agent produced a real reply through the grid");
process.exit(0);
