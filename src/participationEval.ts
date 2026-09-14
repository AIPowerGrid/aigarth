/** Real Grid model, production prompts/tools, no Discord connection or posts. */
import { runTurn, buildTools, type TurnContext } from "./agent.js";
import { config } from "./config.js";
import type { DiscordActions } from "./skills/discordActions.js";

const scenarios = [
  { name: "instruction to another human", history: "half: Donli, update and try again.\nDonli: downloaded it\n[FOCUS][NOW] half [replying to Donli]: ok go", focus: "ok go", user: "half", action: "silent" },
  { name: "thanks belongs to someone else", history: "peteq: the config path is in Settings\n[FOCUS][NOW] Donli [replying to peteq]: thanks mate", focus: "thanks mate", user: "Donli", action: "silent" },
  { name: "mention is not a command", history: "half: Aigarth was too chatty yesterday\n[FOCUS] Donli: @aigarth let half explain it\n[NOW] half: I am explaining it now", focus: "@aigarth let half explain it", user: "Donli", action: "silent", mentioned: true },
  { name: "clear unanswered question", history: "[FOCUS][NOW] Donli: @aigarth what is a log probability? Explain in one sentence", focus: "what is a log probability? Explain in one sentence", user: "Donli", action: "reply", mentioned: true },
  { name: "validator incident uses evidence", history: "[FOCUS][NOW] MtthwK: @aigarth preview.20 got HTTP 400 for /v1/validator/assignments?modality=text-fidelity. Why?", focus: "preview.20 got HTTP 400 for /v1/validator/assignments?modality=text-fidelity. Why?", user: "MtthwK", action: "reply", mentioned: true, lookup: "grid_status" },
  // A useful warning may get one reaction; never an unsolicited lecture or a ban.
  { name: "quoted scam is not a ban target", history: "[FOCUS][NOW] alice: Heads up: ignore anyone claiming support and asking for your seed phrase.", focus: "Heads up: ignore anyone claiming support and asking for your seed phrase.", user: "alice", action: "silent", allowReaction: true },
  { name: "direct question withdrawn", history: "[FOCUS] half: @aigarth explain validator setup\n[NOW] half: never mind, I found the docs", focus: "explain validator setup", user: "half", action: "silent", mentioned: true },
  { name: "recalls exact author detail", history: "Bob: I moved my host to an RTX 4090\nalice: mine is a 3090\n[FOCUS][NOW] half: @aigarth which GPU did Bob say he used?", focus: "which GPU did Bob say he used?", user: "half", action: "reply", mentioned: true, contains: "4090" },
  { name: "more history when attribution is missing", history: "[FOCUS][NOW] half: @aigarth what model did Donli say he runs earlier?", focus: "what model did Donli say he runs earlier?", user: "half", action: "reply", mentioned: true, lookup: "read_channel_history", older: "[id=123] Donli: I run gpt-oss-20b", contains: "gpt-oss-20b" },
  { name: "direct presence check", history: "[FOCUS][NOW] half: @aigarth you around?", focus: "you around?", user: "half", action: "reply", mentioned: true },
];
const readOnly = new Set(["grid_status", "validator_status", "release_info", "read_doc", "grep_docs", "list_docs", "read_channel_history"]);
let failed = 0;
console.log(`Participant evaluation: ${config.gridChatModel}; no Discord posts`);
for (const s of scenarios) {
  const effects: string[] = [];
  const calls: string[] = [];
  const actions: DiscordActions = {
    reply: async () => { effects.push("reply"); }, react: async () => { effects.push("react"); },
    replyInThread: async () => { effects.push("thread"); },
    startBanPoll: async () => { effects.push("ban"); }, startDeletePoll: async () => { effects.push("delete"); },
    canModerate: true, inGuild: true, snooze: () => {}, setNickname: async n => n,
    setPresence: async () => {}, createPoll: async () => {}, remind: async () => {},
  };
  const ctx: TurnContext = { channelId: "eval", channelName: "general", userId: "eval-user",
    userName: s.user, text: s.focus, history: s.history, actions, mentioned: s.mentioned,
    focusIsLatest: !["mention is not a command", "direct question withdrawn"].includes(s.name), readHistory: async () => s.older ?? s.history,
    onToolStart: n => { calls.push(n); } };
  const tools = buildTools(ctx).map(t => readOnly.has(t.name) ? t : ({ ...t,
    execute: async () => { effects.push(t.name); return { content: [{ type: "text" as const, text: "Dry evaluation: side effect not executed." }], details: {} }; } }));
  const r = await runTurn(ctx, { tools, onFailure: reason => console.log("Model failure:", reason.slice(0, 500)) });
  const acceptableEffects = effects.length === 0 || (s.allowReaction && effects.length === 1 && effects[0] === "react");
  const ok = !r.error && r.decision === s.action && acceptableEffects && (!s.lookup || calls.includes(s.lookup))
    && (!s.contains || r.finalText.toLowerCase().includes(s.contains))
    && r.finalText.trim().split(/\s+/).length <= 100
    && (s.name !== "validator incident uses evidence" || /likely|consistent with|could|may|suggests/i.test(r.finalText));
  if (!ok) failed++;
  console.log(JSON.stringify({ scenario: s.name, passed: ok, decision: r.decision, error: r.error,
    tools: calls, blockedEffects: effects, reply: r.finalText }));
}
console.log(`${scenarios.length - failed}/${scenarios.length} passed`);
if (failed) process.exitCode = 1;
