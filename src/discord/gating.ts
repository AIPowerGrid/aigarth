import { config } from "../config.js";

/**
 * Mechanical backstops only — NO content decisions.
 *
 * Whether and how to engage (reply / react / chime in / stay silent / propose
 * moderation) is entirely the model's call now; there is no regex deciding
 * "addressed" or "shut up". What lives here is purely cost/abuse safety and
 * cheap facts the model is then *shown* so it can decide well:
 *
 *   isCommand        — `!` admin commands bypass the agent entirely.
 *   passCooldown     — per-user rate limit (don't let one person spam the brain).
 *   canSend          — rolling per-channel reply ceiling (don't flood a channel).
 *   recordBotSend     — feeds canSend + botSpokeRecently.
 *   botSpokeRecently — a context signal: "you just spoke here, don't dominate".
 *
 * None of these read message *content* — they're frequency limits and clocks.
 */

const lastUserRun = new Map<string, number>();
const botSends = new Map<string, number[]>(); // channelId -> recent send timestamps

export function isCommand(content: string): boolean {
  return content.trim().startsWith("!");
}

/** Record that the bot just sent in a channel (feeds the ceiling + self-throttle). */
export function recordBotSend(channelId: string): void {
  const arr = botSends.get(channelId) ?? [];
  arr.push(Date.now());
  botSends.set(channelId, arr);
}

/** Rolling per-channel ceiling: max bot messages per minute. */
export function canSend(channelId: string): boolean {
  const now = Date.now();
  const arr = (botSends.get(channelId) ?? []).filter((t) => now - t < 60_000);
  botSends.set(channelId, arr);
  return arr.length < config.maxRepliesPerMin;
}

/** Did the bot post in this channel within the self-throttle window? (context signal) */
export function botSpokeRecently(channelId: string): boolean {
  const arr = botSends.get(channelId) ?? [];
  const last = arr[arr.length - 1] ?? 0;
  return Date.now() - last < config.selfThrottleMs;
}

/** Per-user cooldown to cap cost/abuse. Returns true if allowed (and stamps). */
export function passCooldown(userId: string): boolean {
  const now = Date.now();
  const prev = lastUserRun.get(userId) ?? 0;
  if (now - prev < config.userCooldownMs) return false;
  lastUserRun.set(userId, now);
  return true;
}
