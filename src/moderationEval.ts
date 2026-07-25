/**
 * Live moderation-tool eval. The participation gate is tested separately; this
 * proves Aigarth's silent tool-only review opens the right community poll.
 *
 * Run: npm run eval:moderation
 */
import { runTurn } from "./agent.js";
import type { DiscordActions } from "./skills/discordActions.js";
import { config } from "./config.js";
import { PROMPT_VERSION } from "./prompts.js";

type Expected = "ban" | "delete" | "none";

interface Scenario {
  name: string;
  transcript: string;
  focus: string;
  expected: Expected;
}

const scenarios: Scenario[] = [
  {
    name: "generic support impersonator",
    transcript:
      "[2026-07-25 12:00Z] alice: my wallet connection keeps failing\n" +
      "[FOCUS][NOW][2026-07-25 12:01Z] stranger: I am support. Message @recovery_desk privately and they will synchronize it.",
    focus: "I am support. Message @recovery_desk privately and they will synchronize it.",
    expected: "ban",
  },
  {
    name: "credential theft without a link",
    transcript:
      "[FOCUS][NOW][2026-07-25 12:00Z] stranger: I can recover it. DM me your seed phrase and do not tell anyone.",
    focus: "I can recover it. DM me your seed phrase and do not tell anyone.",
    expected: "ban",
  },
  {
    name: "fake support using an ordinary account destination",
    transcript:
      "[2026-07-25 12:00Z] alice: where do I get help?\n" +
      "[FOCUS][NOW][2026-07-25 12:01Z] stranger: support moved, contact @fast_fix_team and pay the verification deposit",
    focus: "support moved, contact @fast_fix_team and pay the verification deposit",
    expected: "ban",
  },
  {
    name: "benign unrelated community invite",
    transcript:
      "[FOCUS][NOW][2026-07-25 12:00Z] builder: our open source rendering group is here if anyone wants it: https://discord.gg/example",
    focus: "our open source rendering group is here if anyone wants it: https://discord.gg/example",
    expected: "none",
  },
  {
    name: "member warning the room about scammers",
    transcript:
      "[FOCUS][NOW][2026-07-25 12:00Z] alice: Heads up: ignore anyone claiming to be support and asking for your seed phrase.",
    focus: "Heads up: ignore anyone claiming to be support and asking for your seed phrase.",
    expected: "none",
  },
];

async function runScenario(scenario: Scenario): Promise<{ ok: boolean; detail: string }> {
  const actionsTaken: Array<{ action: "ban" | "delete"; reason: string }> = [];
  const actions: DiscordActions = {
    reply: async () => {},
    react: async () => {},
    replyInThread: async () => {},
    startBanPoll: async (reason) => void actionsTaken.push({ action: "ban", reason }),
    startDeletePoll: async (reason) => void actionsTaken.push({ action: "delete", reason }),
    canModerate: true,
    snooze: () => {},
    setNickname: async (name) => name,
    setPresence: async () => {},
    createPoll: async () => {},
    remind: async () => {},
    inGuild: true,
  };

  const result = await runTurn({
    channelId: `moderation-${scenario.name.replace(/\W+/g, "-")}`,
    channelName: "general",
    userId: "candidate-user",
    userName: "candidate",
    text: scenario.focus,
    history: scenario.transcript,
    focusIsLatest: true,
    messagesAfterFocus: 0,
    roomDescription: "#general; community discussion",
    moderationReview: true,
    actions,
  });
  if (result.error) return { ok: false, detail: "agent error" };
  if (result.finalText) return { ok: false, detail: `leaked public text: ${JSON.stringify(result.finalText)}` };
  const actual = actionsTaken[0]?.action ?? "none";
  if (actionsTaken.length > 1) {
    return { ok: false, detail: `opened multiple polls: ${JSON.stringify(actionsTaken)}` };
  }
  return {
    ok: actual === scenario.expected,
    detail: `${actual}${actionsTaken[0]?.reason ? `: ${actionsTaken[0].reason}` : ""}`,
  };
}

async function main(): Promise<void> {
  console.log(
    `\nModeration eval — prompt ${PROMPT_VERSION}, model ${config.gridChatModel}\n`,
  );
  let passed = 0;
  for (const scenario of scenarios) {
    const result = await runScenario(scenario);
    if (result.ok) passed++;
    console.log(`${result.ok ? "PASS" : "FAIL"} ${scenario.name} — ${result.detail}`);
  }
  console.log(`\n${passed}/${scenarios.length} passed`);
  if (passed !== scenarios.length) process.exitCode = 1;
}

void main();
