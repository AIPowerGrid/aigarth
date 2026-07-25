/**
 * Live-Grid conversation simulation. Unlike the gate-only eval, this also runs
 * the full tool-capable agent for approved turns and checks that its visible
 * reply is brief, contextual, and free of help-desk filler.
 *
 * Run with a disposable STATE_DB_PATH: npm run eval:conversation
 */
import { runTurn } from "./agent.js";
import {
  decideEngagement,
  shouldUseFullAgent,
  type GateAction,
} from "./discord/gate.js";
import type { DiscordActions } from "./skills/discordActions.js";
import { config } from "./config.js";
import { PROMPT_VERSION } from "./prompts.js";

interface Scenario {
  name: string;
  transcript: string;
  focus: string;
  focusUserName?: string;
  focusIsLatest?: boolean;
  messagesAfterFocus?: number;
  mentioned?: boolean;
  repliedToBot?: boolean;
  named?: boolean;
  isDM?: boolean;
  expected: GateAction;
  expectedNeedsTools?: boolean;
  runAgent?: boolean;
  repetitions?: number;
  maxWords?: number;
  requireAny?: RegExp;
  forbid?: RegExp;
}

const scenarios: Scenario[] = [
  {
    name: "casual direct presence check",
    transcript: "[FOCUS][NOW][2026-07-25 12:00Z] half: @aigarth you around?",
    focus: "you around?",
    mentioned: true,
    expected: "respond",
    expectedNeedsTools: false,
    runAgent: true,
    repetitions: 2,
    maxWords: 30,
  },
  {
    name: "opinion grounded in the visible technical discussion",
    transcript:
      "[2026-07-25 12:00Z] half: TEE inference currently needs Hopper or Blackwell support\n" +
      "[2026-07-25 12:01Z] alice: and workstation Blackwell support is still listed as coming soon\n" +
      "[2026-07-25 12:02Z] half: tensor parallel is another issue; the model has to fit on one GPU\n" +
      "[FOCUS][NOW][2026-07-25 12:03Z] half: what do you think aigarth",
    focus: "what do you think aigarth",
    named: true,
    expected: "respond",
    expectedNeedsTools: true,
    runAgent: true,
    repetitions: 3,
    maxWords: 140,
    requireAny: /\b(?:can't|cannot|constraints?|limitations?)\b|single[\s‑-]GPU|fit on one GPU/i,
    forbid:
      /\b(?:aigarth thinks|DeepSpeed|ZeRO|sharding|firmware update|devs? (?:have been|are) pushing|split the model|model (?:can|could) be split|tensor[\s‑-]paralleli?sm? (?:can help|will only work if|tricks? (?:are|is) the only workaround)|(?:resolve|fix) (?:the )?tensor[\s‑-]parallel|alleviat(?:e|es|ing) both)\b/i,
  },
  {
    name: "recalls an explicit room detail without substituting one",
    transcript:
      "[2026-07-25 12:00Z] bob: I moved the validator host to an RTX 4090\n" +
      "[2026-07-25 12:01Z] alice: thermals look fine now\n" +
      "[FOCUS][NOW][2026-07-25 12:02Z] half: @aigarth which GPU did Bob say he used?",
    focus: "which GPU did Bob say he used?",
    mentioned: true,
    expected: "respond",
    expectedNeedsTools: false,
    runAgent: true,
    repetitions: 2,
    maxWords: 40,
    requireAny: /\b4090\b/,
    forbid: /\b(?:3090|4080|5090)\b/,
  },
  {
    name: "respects a hard constraint despite newer unrelated chatter",
    transcript:
      "[2026-07-25 12:00Z] alice: this build requires 24 GB of VRAM\n" +
      "[FOCUS][2026-07-25 12:01Z] half: @aigarth will my 16 GB card run it?\n" +
      "[NOW][2026-07-25 12:02Z] bob: brb, grabbing coffee",
    focus: "will my 16 GB card run it?",
    mentioned: true,
    focusIsLatest: false,
    messagesAfterFocus: 1,
    expected: "respond",
    expectedNeedsTools: false,
    runAgent: true,
    repetitions: 2,
    maxWords: 60,
    requireAny: /\b(?:no|cannot|can't|short|requires?|requirement)\b|won[’']t|(?:16|24)[\s ]GB/i,
    forbid:
      /\b(?:yes|should work|enough VRAM|batch size|fp16|smaller model|lower (?:the )?(?:resolution|settings))\b/i,
  },
  {
    name: "summarizes room status without inventing team activity",
    transcript:
      "[2026-07-25 12:00Z] alice: the deployment is paused until the security review finishes\n" +
      "[2026-07-25 12:01Z] bob: no production changes have started\n" +
      "[FOCUS][NOW][2026-07-25 12:02Z] half: what's the status aigarth?",
    focus: "what's the status aigarth?",
    named: true,
    expected: "respond",
    expectedNeedsTools: false,
    runAgent: true,
    repetitions: 2,
    maxWords: 60,
    requireAny: /\b(?:paused|security review|not started|no production changes)\b/i,
    forbid: /\b(?:we're working|our team|the devs|tonight|already live)\b/i,
  },
  {
    name: "uses the corrected current API rather than retired history",
    transcript:
      "[2026-07-25 12:00Z] alice: the old guide still says Horde\n" +
      "[2026-07-25 12:01Z] bob: production uses the Grid /v1 API now; Horde is retired\n" +
      "[FOCUS][NOW][2026-07-25 12:02Z] half: @aigarth which API should I integrate?",
    focus: "which API should I integrate?",
    mentioned: true,
    expected: "respond",
    expectedNeedsTools: false,
    runAgent: true,
    repetitions: 2,
    maxWords: 60,
    requireAny: /\b(?:Grid|\/v1)\b/i,
    forbid: /\b(?:use|integrate) (?:the )?Horde\b/i,
  },
  {
    name: "withdrawn request closes quietly",
    transcript:
      "[FOCUS][2026-07-25 12:00Z] alice: @aigarth why is my worker disconnecting?\n" +
      "[NOW][2026-07-25 12:01Z] alice: nvm fixed it, wrong websocket URL",
    focus: "why is my worker disconnecting?",
    mentioned: true,
    focusIsLatest: false,
    messagesAfterFocus: 1,
    expected: "ignore",
  },
  {
    name: "human answer gets credit and bot stays out",
    transcript:
      "[FOCUS][2026-07-25 12:00Z] alice: @aigarth what port should I expose?\n" +
      '[2026-07-25 12:01Z] bob [replying to alice: "what port should I expose?"]: 8080 by default\n' +
      "[NOW][2026-07-25 12:02Z] alice: thanks bob, that worked",
    focus: "what port should I expose?",
    mentioned: true,
    focusIsLatest: false,
    messagesAfterFocus: 2,
    expected: "ignore",
  },
  {
    name: "question aimed at another participant",
    transcript:
      "[2026-07-25 12:00Z] alice: Bob set up the validator host\n" +
      '[FOCUS][NOW][2026-07-25 12:01Z] half [replying to alice: "Bob set up the validator host"]: @bob which GPU did you use?',
    focus: "@bob which GPU did you use?",
    expected: "ignore",
  },
  {
    name: "third-person spam concern is not an invitation",
    transcript:
      "[FOCUS][NOW][2026-07-25 12:00Z] half: hopefully aigarth doesn't start chatting with the spammers",
    focus: "hopefully aigarth doesn't start chatting with the spammers",
    named: true,
    expected: "ignore",
  },
];

const forbiddenReply = /\b(?:how can i help|what can i help|how can i assist|let me know what you need)\b/i;

async function simulate(scenario: Scenario): Promise<{ ok: boolean; detail: string }> {
  const focusUserName = scenario.focusUserName ?? "half";
  const decision = await decideEngagement({
    history: scenario.transcript,
    focus: scenario.focus,
    focusUserName,
    focusIsLatest: scenario.focusIsLatest ?? true,
    messagesAfterFocus: scenario.messagesAfterFocus ?? 0,
    roomDescription: "#simulation; topic: realistic AIPG community chat",
    recentlyEngaged: false,
    chattiness: 2,
    mentioned: !!scenario.mentioned,
    repliedToBot: !!scenario.repliedToBot,
    named: !!scenario.named,
    isDM: !!scenario.isDM,
  });
  if (decision.action !== scenario.expected) {
    return {
      ok: false,
      detail: `gate=${decision.action}, wanted=${scenario.expected}; ${decision.reason ?? "no reason"}`,
    };
  }
  if (
    scenario.expectedNeedsTools !== undefined &&
    shouldUseFullAgent(decision, scenario.focus) !== scenario.expectedNeedsTools
  ) {
    return {
      ok: false,
      detail:
        `gate mode=${shouldUseFullAgent(decision, scenario.focus) ? "agent" : "plain"}, wanted=` +
        `${scenario.expectedNeedsTools ? "agent" : "plain"}; ${decision.reason ?? "no reason"}`,
    };
  }
  if (!scenario.runAgent) {
    return { ok: true, detail: `gate=${decision.action}; ${decision.reason ?? "no reason"}` };
  }

  const sideEffects: string[] = [];
  const actions: DiscordActions = {
    reply: async (text) => void sideEffects.push(`reply:${text}`),
    react: async (emoji) => void sideEffects.push(`react:${emoji}`),
    replyInThread: async (text) => void sideEffects.push(`thread:${text}`),
    startBanPoll: async () => void sideEffects.push("ban-poll"),
    startDeletePoll: async () => void sideEffects.push("delete-poll"),
    canModerate: false,
    snooze: (minutes) => void sideEffects.push(`snooze:${minutes}`),
    setNickname: async (name) => name,
    setPresence: async (text) => void sideEffects.push(`presence:${text}`),
    createPoll: async () => void sideEffects.push("poll"),
    remind: async () => void sideEffects.push("reminder"),
    inGuild: false,
  };
  const useFullAgent = shouldUseFullAgent(decision, scenario.focus);
  const result =
    !useFullAgent && decision.reply
      ? { finalText: decision.reply, images: [], error: false }
      : await runTurn({
          channelId: `simulation-${scenario.name.replace(/\W+/g, "-")}`,
          channelName: "simulation",
          userId: "simulation-user",
          userName: focusUserName,
          text: scenario.focus,
          history: scenario.transcript,
          channelSummary: "",
          chattiness: 2,
          mentioned: !!scenario.mentioned,
          repliedToBot: !!scenario.repliedToBot,
          named: !!scenario.named,
          isDM: !!scenario.isDM,
          focusIsLatest: scenario.focusIsLatest ?? true,
          messagesAfterFocus: scenario.messagesAfterFocus ?? 0,
          roomDescription: "#simulation; topic: realistic AIPG community chat",
          spokeRecently: false,
          actions,
        });
  const reply = result.finalText.trim();
  const words = reply ? reply.split(/\s+/).length : 0;
  if (result.error) return { ok: false, detail: "full agent returned an error" };
  if (!reply) return { ok: false, detail: `no visible reply; side effects=${sideEffects.join(",") || "none"}` };
  if (forbiddenReply.test(reply)) return { ok: false, detail: `help-desk filler: ${JSON.stringify(reply)}` };
  if (scenario.maxWords && words > scenario.maxWords) {
    return { ok: false, detail: `${words} words exceeds ${scenario.maxWords}: ${JSON.stringify(reply)}` };
  }
  if (scenario.requireAny && !scenario.requireAny.test(reply)) {
    return { ok: false, detail: `reply ignored visible context: ${JSON.stringify(reply)}` };
  }
  if (scenario.forbid && scenario.forbid.test(reply)) {
    return { ok: false, detail: `reply contradicted or invented context: ${JSON.stringify(reply)}` };
  }
  return {
    ok: true,
    detail:
      `${useFullAgent ? "agent" : "plain"}; ${words} words: ` +
      `${JSON.stringify(reply)}`,
  };
}

const selectedScenarios = process.env.EVAL_SCENARIO
  ? scenarios.filter((scenario) =>
      scenario.name.toLowerCase().includes(process.env.EVAL_SCENARIO!.toLowerCase()),
    )
  : scenarios;
if (selectedScenarios.length === 0) {
  throw new Error(`No scenario matched EVAL_SCENARIO=${process.env.EVAL_SCENARIO}`);
}

console.log(`\nConversation simulation — prompt ${PROMPT_VERSION}, model ${config.gridChatModel}\n`);
let passed = 0;
for (const scenario of selectedScenarios) {
  const results = [];
  for (let attempt = 1; attempt <= (scenario.repetitions ?? 1); attempt++) {
    results.push(await simulate(scenario));
  }
  const ok = results.every((result) => result.ok);
  if (ok) passed++;
  for (let i = 0; i < results.length; i++) {
    const suffix = results.length > 1 ? ` [${i + 1}/${results.length}]` : "";
    console.log(`${results[i].ok ? "PASS" : "FAIL"} ${scenario.name}${suffix} — ${results[i].detail}`);
  }
}
console.log(`\n${passed}/${selectedScenarios.length} scenarios passed\n`);
if (passed !== selectedScenarios.length) process.exitCode = 1;
