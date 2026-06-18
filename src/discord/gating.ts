import type { Client, Message } from "discord.js";
import { config } from "../config.js";
import { settings } from "../store/db.js";

/**
 * Two-tier response gating.
 *
 * Old aigarth ran a full LLM call on EVERY message to decide whether to speak —
 * the audit's #1 cost problem. New design:
 *
 *   addressed → always run the agent (mention / name / reply-to-bot / DM)
 *   proactive → MAYBE run, gated cheaply by chattiness + signal (no LLM in the
 *               gate). When it does run, the agent itself chooses to reply,
 *               react, or stay silent — restoring the old "decide when to
 *               respond" + emoji behavior, but only paying for the LLM on
 *               messages that already cleared a free filter.
 *   skip      → do nothing
 *
 * So chattiness is back and meaningful, without an LLM call per message.
 */

export type Engagement = "addressed" | "candidate" | "skip";

const lastUserRun = new Map<string, number>();
const lastProactive = new Map<string, number>(); // channelId -> ts (anti-spam)
const botSends = new Map<string, number[]>(); // channelId -> recent send timestamps

export function isCommand(content: string): boolean {
  return content.trim().startsWith("!");
}

// Explicit "be quiet" aimed at the bot. The correct response to "don't respond"
// is SILENCE — not "ok, I'll step back 🙏" (which is itself a response, the exact
// thing the user is annoyed about). When this matches we skip the turn entirely.
// Kept deliberately specific so genuine questions ("how do I stop my worker",
// "the bridge won't shut down") don't trip it.
const DISMISS_RE = new RegExp(
  [
    `don['’]?t\\s+(?:you\\s+)?(?:respond|reply|answer|talk|chime\\s*in|butt\\s*in)`,
    `stop\\s+(?:responding|replying|answering|talking|chiming|it|that)`,
    `shut\\s*(?:up|it)|stfu`,
    `be\\s+quiet|quiet\\s+down|pipe\\s+down`,
    `go\\s+away|leave\\s+(?:me|us)\\s+alone|buzz\\s+off|knock\\s+it\\s+off|back\\s+off`,
    `no\\s*(?:one|body)\\s+(?:asked|is\\s+talking\\s+to\\s+you)`,
    `not\\s+(?:talking\\s+to\\s+you|for\\s+you|you\\b)`,
  ].join("|"),
  "i",
);

export function isDismissal(content: string): boolean {
  return DISMISS_RE.test(content);
}

export function isAddressed(client: Client, message: Message): boolean {
  if (client.user && message.mentions.has(client.user.id)) return true;
  // Reply to one of the bot's messages (when the reply pings).
  if (client.user && message.mentions.repliedUser?.id === client.user.id) return true;
  const re = new RegExp(`\\b${escapeRe(config.botName)}\\b`, "i");
  if (re.test(message.content)) return true;
  // Conversational continuity: if the bot just spoke in this channel, treat the
  // next human message as a reply to it (so follow-ups like "I asked you a
  // question" continue the convo instead of being ignored).
  if (spokeRecently(message.channelId)) return true;
  return false;
}

// #4 hard backstop: max bot messages per channel per rolling minute.
export function recordBotSend(channelId: string): void {
  const arr = botSends.get(channelId) ?? [];
  arr.push(Date.now());
  botSends.set(channelId, arr);
}
export function canSend(channelId: string): boolean {
  const now = Date.now();
  const arr = (botSends.get(channelId) ?? []).filter((t) => now - t < 60_000);
  botSends.set(channelId, arr);
  return arr.length < config.maxRepliesPerMin;
}
// #3 self-throttle: did the bot just speak here?
function spokeRecently(channelId: string): boolean {
  const arr = botSends.get(channelId) ?? [];
  const last = arr[arr.length - 1] ?? 0;
  return Date.now() - last < config.selfThrottleMs;
}

export function decideEngagement(client: Client, message: Message): Engagement {
  if (message.author.bot) return "skip";
  const content = message.content.trim();
  if (!content || isCommand(content)) return "skip";
  if (!message.guild) return "addressed"; // DMs
  if (config.readonlyChannels.includes(message.channelId)) return "skip";
  if (config.channels.length > 0 && !config.channels.includes(message.channelId)) return "skip";

  // "shut up / don't respond / not you" → stay silent, even when named. This
  // overrides isAddressed on purpose: the message mentions the bot precisely to
  // tell it to be quiet.
  if (isDismissal(content)) return "skip";

  if (isAddressed(client, message)) return "addressed";

  // Candidate for the LLM gate: it's an unaddressed message worth *asking the
  // model about*. Cheap deterministic backstops keep us from invoking the gate
  // on obvious noise or hammering the single worker — the model makes the actual
  // chime-in decision (see decideProactive).
  if (content.length < 6) return "skip"; // "lol", "ok" — never worth a gate call
  if (settings.getChattiness() <= 1) return "skip"; // muted
  if (!canSend(message.channelId)) return "skip"; // #4 ceiling
  const now = Date.now();
  if (now - (lastProactive.get(message.channelId) ?? 0) < config.proactiveCooldownMs) return "skip";
  lastProactive.set(message.channelId, now);
  return "candidate";
}

/** Per-user cooldown to cap cost/abuse. Returns true if allowed (and stamps). */
export function passCooldown(userId: string): boolean {
  const now = Date.now();
  const prev = lastUserRun.get(userId) ?? 0;
  if (now - prev < config.userCooldownMs) return false;
  lastUserRun.set(userId, now);
  return true;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
