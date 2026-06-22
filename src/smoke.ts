/**
 * End-to-end smoke test: run ONE real prompt through the actual agent path
 * (runTurn → pi → grid → worker) and assert a non-empty, non-error reply.
 *
 * This is the test whose absence let "No API key for provider" ship silently.
 * Run after any change to the agent/grid wiring:  npm run smoke
 * Exits 0 on a real reply, 1 on empty/error.
 */
import { runTurn } from "./agent.js";

// Capture whatever the agent "says" through its reply tool (or the addressed
// safety-net free text), without touching Discord.
let said = "";
const r = await runTurn({
  channelId: "smoke",
  channelName: "smoke",
  userId: "smoke",
  userName: "tester",
  text: "Reply with a short friendly hello.",
  mentioned: true,
  actions: {
    reply: async (t) => {
      said += t;
    },
    react: async () => {},
    replyInThread: async (t) => {
      said += t;
    },
    startBanPoll: async () => {},
    startDeletePoll: async () => {},
    canModerate: false,
  },
});

const reply = said || r.finalText;
console.log("reply:", JSON.stringify(reply));
console.log("error:", r.error, "| images:", r.images.length, "| via tool:", said.length > 0);

if (r.error || !reply) {
  console.error("❌ SMOKE FAIL — agent returned empty/error (brain not reachable?)");
  process.exit(1);
}
console.log("✅ SMOKE OK — agent produced a real reply through the grid");
process.exit(0);
