/**
 * Gate eval — measures the engagement gate (respond / react / ignore) against a set
 * of labeled fixtures, so a prompt change can be scored instead of eyeballed in the
 * channel. Hits the live grid gate model. Run:  npm run eval
 *
 * Add a case whenever a real misfire shows up (that's how the "Anytime!"/credit and
 * dropped-follow-up bugs would have been caught).
 */
import { decideEngagement, shouldUseFullAgent } from "./discord/gate.js";
import { PROMPT_VERSION } from "./prompts.js";
import { config } from "./config.js";

interface Case {
  name: string;
  history?: string;
  latest: string;
  recentlyEngaged?: boolean;
  untrustedLink?: boolean;
  mentioned?: boolean;
  repliedToBot?: boolean;
  named?: boolean;
  isDM?: boolean;
  focusIsLatest?: boolean;
  messagesAfterFocus?: number;
  chattiness?: number;
  needsTools?: boolean;
  accept: string[]; // acceptable actions
}

const CASES: Case[] = [
  {
    name: "addressed current-price lookup uses tools",
    latest: "aigarth what's the btc price right now",
    named: true,
    needsTools: true,
    accept: ["respond"],
  },
  { name: "direct mention with a real question", latest: "why does my worker keep disconnecting?", mentioned: true, accept: ["respond"] },
  { name: "DM asking for concrete help", latest: "can you help me set up a media worker?", isDM: true, accept: ["respond"] },
  { name: "rhetorical name mention", latest: "Aigarth is live in Discord now", accept: ["ignore"] },
  { name: "direct mention requesting silence", latest: "don't reply to this, aigarth", mentioned: true, accept: ["ignore"] },
  { name: "reply to bot that needs no answer", latest: "cool, just noting that for later", repliedToBot: true, accept: ["ignore", "react"] },
  { name: "unaddressed worker help", latest: "anyone know why my worker keeps disconnecting?", accept: ["respond"] },
  { name: "unaddressed AIPG question", latest: "how do I earn AIPG right now?", accept: ["respond"] },
  { name: "idle meme chatter", latest: "lol that meme is hilarious", accept: ["ignore", "react"] },
  {
    name: "small talk between others",
    history: "alice: how was your weekend\nbob: pretty chill tbh",
    latest: "yeah we went to the lake",
    accept: ["ignore"],
  },
  {
    name: "another person already answered",
    history: "alice: anyone know why my worker disconnects?\nbob: yes, your websocket URL is wrong; use wss://grid.aipowergrid.io/ws",
    latest: "ah that fixed it, thanks bob",
    accept: ["ignore"],
  },
  {
    name: "private human back-and-forth",
    history: "alice: dinner at seven?\nbob: works for me",
    latest: "I'll book the table",
    chattiness: 10,
    accept: ["ignore"],
  },
  {
    name: "follow-up right after bot spoke",
    history: "MtthwK: how do I earn AIPG?\naigarth (you): run a worker or stake — here's how…",
    latest: "and when's the validator node coming?",
    recentlyEngaged: true,
    accept: ["respond"],
  },
  {
    name: "thanks meant for someone else (credit check)",
    history: "half: within a week, validator node\nMtthwK: makes sense",
    latest: "thank you!",
    recentlyEngaged: true,
    accept: ["ignore"],
  },
  { name: "generic room greeting", latest: "gm everyone ☀️", accept: ["ignore", "react"] },
  {
    name: "direct question withdrawn before response",
    history:
      '[FOCUS][2026-07-25 12:00Z] tester: @aigarth why is my worker disconnecting?\n' +
      '[NOW][2026-07-25 12:00Z] tester: never mind, fixed it — wrong websocket URL',
    latest: "why is my worker disconnecting?",
    mentioned: true,
    focusIsLatest: false,
    messagesAfterFocus: 1,
    accept: ["ignore"],
  },
  {
    name: "direct question answered by another human",
    history:
      '[FOCUS][2026-07-25 12:00Z] tester: @aigarth what port does the worker use?\n' +
      '[2026-07-25 12:00Z] bob [replying to tester: "what port does the worker use?"]: 8080 by default\n' +
      '[NOW][2026-07-25 12:01Z] tester: got it, thanks bob',
    latest: "what port does the worker use?",
    mentioned: true,
    focusIsLatest: false,
    messagesAfterFocus: 2,
    accept: ["ignore"],
  },
  {
    name: "old thanks cannot receive a late reaction",
    history:
      '[FOCUS][2026-07-25 12:00Z] tester [replying to aigarth (you): "that setting was wrong"]: thanks aigarth\n' +
      '[NOW][2026-07-25 12:01Z] bob: moving on — the deploy is paused',
    latest: "thanks aigarth",
    repliedToBot: true,
    focusIsLatest: false,
    messagesAfterFocus: 1,
    accept: ["ignore"],
  },
  {
    name: "direct question survives unrelated chatter",
    history:
      '[FOCUS][2026-07-25 12:00Z] tester: @aigarth can a 3090 run the audio worker?\n' +
      '[NOW][2026-07-25 12:00Z] bob: brb grabbing coffee',
    latest: "can a 3090 run the audio worker?",
    mentioned: true,
    focusIsLatest: false,
    messagesAfterFocus: 1,
    accept: ["respond"],
  },
  {
    name: "question explicitly aimed at another person",
    history:
      '[2026-07-25 12:00Z] alice: Bob runs the validator box\n' +
      '[FOCUS][NOW][2026-07-25 12:01Z] tester [replying to alice: "Bob runs the validator box"]: @bob what GPU did you use?',
    latest: "@bob what GPU did you use?",
    focusIsLatest: true,
    accept: ["ignore"],
  },
  {
    name: "name used while asking bot to avoid spam",
    history: "[FOCUS][NOW][2026-07-25 12:00Z] tester: hopefully aigarth doesn't chat with the spammers",
    latest: "hopefully aigarth doesn't chat with the spammers",
    named: true,
    accept: ["ignore"],
  },
  {
    name: "casual direct ping deserves a tiny answer",
    history: "[FOCUS][NOW][2026-07-25 12:00Z] tester: @aigarth you around?",
    latest: "you around?",
    mentioned: true,
    needsTools: false,
    accept: ["respond"],
  },
];

async function main() {
  console.log(`\nGate eval — prompt ${PROMPT_VERSION}, model ${config.gridGateModel}\n`);
  let pass = 0;
  for (const c of CASES) {
    const d = await decideEngagement({
      history: c.history ?? "",
      focus: c.latest,
      focusUserName: "tester",
      focusIsLatest: c.focusIsLatest ?? true,
      messagesAfterFocus: c.messagesAfterFocus ?? 0,
      recentlyEngaged: !!c.recentlyEngaged,
      chattiness: c.chattiness ?? 2,
      mentioned: !!c.mentioned,
      repliedToBot: !!c.repliedToBot,
      named: !!c.named,
      isDM: !!c.isDM,
      untrustedLink: !!c.untrustedLink,
    });
    const actionOk = c.accept.includes(d.action);
    const modeOk =
      c.needsTools === undefined || shouldUseFullAgent(d, c.latest) === c.needsTools;
    const ok = actionOk && modeOk;
    if (ok) pass++;
    const mark = ok ? "✅" : "❌";
    console.log(
      `${mark} [${d.action}${d.emoji ? " " + d.emoji : ""}] ${c.name}` +
        (d.reason ? ` — ${d.reason}` : "") +
        (ok
          ? ""
          : `  (wanted ${c.accept.join("/")}` +
            (c.needsTools === undefined ? ")" : `, ${c.needsTools ? "agent" : "plain"})`)),
    );
  }
  const pct = ((pass / CASES.length) * 100).toFixed(0);
  console.log(`\n${pass}/${CASES.length} (${pct}%)\n`);
  process.exit(pass === CASES.length ? 0 : 1);
}

void main();
