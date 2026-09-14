import { config } from "../config.js";

/**
 * Command parsing and recent-send context only. Discord.js owns API rate limiting.
 *
 * Whether and how to engage (reply / react / chime in / stay silent / propose
 * moderation) is entirely the model's call now; there is no regex deciding
 * "addressed" or "shut up". What lives here is purely cost/abuse safety and
 * cheap facts the model is then *shown* so it can decide well:
 *
 *   isCommand        — `!` admin commands bypass the agent entirely.
 *   recordBotSend    — records the time of the last public action.
 *   botSpokeRecently — a context signal: "you just spoke here, don't dominate".
 *
 * None of these read message *content* — they're frequency limits and clocks.
 */

const botSends = new Map<string, number>();

export function isCommand(content: string): boolean {
  return content.trim().startsWith("!");
}

/** Record that the bot just sent in a channel (feeds the ceiling + self-throttle). */
export function recordBotSend(channelId: string): void {
  botSends.set(channelId, Date.now());
}

/** Did the bot post in this channel within the self-throttle window? (context signal) */
export function botSpokeRecently(channelId: string): boolean {
  const last = botSends.get(channelId);
  return last !== undefined && Date.now() - last < config.selfThrottleMs;
}
