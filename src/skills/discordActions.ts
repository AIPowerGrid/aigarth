import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";

/**
 * Discord actions as tools.
 *
 * Discord side effects selected by the full agent. Plain text is returned by
 * the agent and posted by the Discord turn layer after grounding and stale-room
 * validation. A thread tool selects the destination, but its text is likewise
 * deferred until that final posting boundary.
 *
 * The discord layer (index.ts) supplies the actual side-effecting callbacks
 * per-turn (bound to the triggering message/channel); these factories just wrap
 * them as pi `AgentTool`s with the framing the model reads.
 */
export interface DiscordActions {
  /** Post a message to the channel (the real chat reply). */
  reply(text: string): Promise<void>;
  /** React to the message with a single emoji. */
  react(emoji: string): Promise<void>;
  /** Post into a thread off the triggering message (creating it if needed). */
  replyInThread(text: string, threadName?: string): Promise<void>;
  /** Open a community vote to ban the user (passes only on enough human votes). */
  startBanPoll(reason: string): Promise<void>;
  /** Open a community vote to delete the message (passes only on enough votes). */
  startDeletePoll(reason: string): Promise<void>;
  /** Whether moderation polls are available here (guild + not a DM). */
  canModerate: boolean;
  /** Mute itself in this channel for N minutes (lurk/snooze). */
  snooze(minutes: number): void;
  /** Change its own server nickname. Returns a short status string. */
  setNickname(name: string): Promise<string>;
  /** Change its own Discord status/activity text. */
  setPresence(text: string): Promise<void>;
  /** Create a native Discord poll in the channel. */
  createPoll(question: string, options: string[], hours: number): Promise<void>;
  /** Remind the current user after N minutes (persisted). */
  remind(text: string, minutes: number): Promise<void>;
  /** Whether identity tools (nickname) apply here (guild). */
  inGuild: boolean;
}

export function makeReplyTool(actions: DiscordActions): AgentTool {
  return {
    name: "reply",
    label: "Reply",
    description:
      "Say something in the channel. THIS is how you actually speak — any text you " +
      "write outside a tool call is private scratch and is NOT seen by anyone, so to " +
      "be heard you MUST call reply. Keep it natural and in-character, like a real " +
      "person in the chat (match their length; a quick 'yo' for a quick 'hey'). Call " +
      "reply again to send a follow-up message. To stay silent, just don't call it.",
    parameters: Type.Object({
      text: Type.String({ description: "The message to post, in your own voice." }),
    }),
    execute: async (_id, params: any) => {
      const text = String(params.text ?? "");
      try {
        await actions.reply(text);
        return { content: [{ type: "text", text: "sent" }], details: {} };
      } catch (e) {
        return { content: [{ type: "text", text: `reply failed: ${e}` }], details: {} };
      }
    },
  };
}

export function makeThreadReplyTool(actions: DiscordActions): AgentTool {
  return {
    name: "reply_in_thread",
    label: "Reply in Thread",
    description:
      "Reply in a thread branched off the user's message instead of in the main " +
      "channel. Use this for a deeper side-conversation (a long debug, a tangent) so " +
      "you don't clutter the room. Same as reply otherwise.",
    parameters: Type.Object({
      text: Type.String({ description: "The message to post in the thread." }),
      thread_name: Type.Optional(Type.String({ description: "Short title if a new thread is created." })),
    }),
    execute: async (_id, params: any) => {
      try {
        await actions.replyInThread(String(params.text ?? ""), params.thread_name ? String(params.thread_name) : undefined);
        return { content: [{ type: "text", text: "thread reply queued for final review" }], details: {} };
      } catch (e) {
        return { content: [{ type: "text", text: `thread reply failed: ${e}` }], details: {} };
      }
    },
  };
}

export function makeBanPollTool(actions: DiscordActions): AgentTool {
  return {
    name: "start_ban_poll",
    label: "Start Ban Poll",
    description:
      "Open a COMMUNITY VOTE to ban this user. You are not banning anyone — you're " +
      "proposing it; the user is only banned if enough humans vote ✅. Use ONLY for " +
      "clear scams, raids, wallet-drainer links, or seriously abusive behavior. When " +
      "the triggering message is a reply, the vote targets the replied-to user. Never " +
      "use it to win an argument or against people just being annoying.",
    parameters: Type.Object({
      reason: Type.String({ description: "Plain, specific reason shown on the vote (what they did)." }),
    }),
    execute: async (_id, params: any) => {
      if (!actions.canModerate) {
        return { content: [{ type: "text", text: "can't open a vote here (not a guild channel)" }], details: {} };
      }
      try {
        await actions.startBanPoll(String(params.reason ?? "no reason given"));
        return { content: [{ type: "text", text: "ban poll opened — the community will decide" }], details: {} };
      } catch (e) {
        return { content: [{ type: "text", text: `couldn't open ban poll: ${e}` }], details: {} };
      }
    },
  };
}

export function makeDeletePollTool(actions: DiscordActions): AgentTool {
  return {
    name: "start_delete_poll",
    label: "Start Delete Poll",
    description:
      "Open a COMMUNITY VOTE to delete this message. You are not deleting it — it's " +
      "removed only if enough humans vote ✅. Use for clear spam/scam/NSFW posts that " +
      "should come down but don't necessarily warrant a ban. When the triggering " +
      "message is a reply, the vote targets the replied-to message.",
    parameters: Type.Object({
      reason: Type.String({ description: "Plain, specific reason shown on the vote." }),
    }),
    execute: async (_id, params: any) => {
      if (!actions.canModerate) {
        return { content: [{ type: "text", text: "can't open a vote here (not a guild channel)" }], details: {} };
      }
      try {
        await actions.startDeletePoll(String(params.reason ?? "no reason given"));
        return { content: [{ type: "text", text: "delete poll opened — the community will decide" }], details: {} };
      } catch (e) {
        return { content: [{ type: "text", text: `couldn't open delete poll: ${e}` }], details: {} };
      }
    },
  };
}

export function makeSnoozeTool(actions: DiscordActions): AgentTool {
  return {
    name: "snooze",
    label: "Snooze",
    description:
      "Mute yourself in THIS channel for a while — you'll keep reading but won't " +
      "respond. Use when someone asks you to chill/lurk, or you sense you're being " +
      "too much. A direct mention later still reaches you once it wears off.",
    parameters: Type.Object({
      minutes: Type.Number({ description: "How long to stay quiet, in minutes (1-720)." }),
    }),
    execute: async (_id, params: any) => {
      const m = Math.max(1, Math.min(720, Math.round(Number(params.minutes) || 15)));
      actions.snooze(m);
      return { content: [{ type: "text", text: `lurking for ${m}m` }], details: {} };
    },
  };
}

export function makeSetNicknameTool(actions: DiscordActions): AgentTool {
  return {
    name: "set_nickname",
    label: "Set Nickname",
    description:
      "Change your own server nickname (e.g. to match your mood or a bit). Keep it " +
      "tasteful — it's how everyone sees you. Empty resets to your default name.",
    parameters: Type.Object({
      name: Type.String({ description: "New nickname (≤32 chars). Empty to reset." }),
    }),
    execute: async (_id, params: any) => {
      try {
        const status = await actions.setNickname(String(params.name ?? ""));
        return { content: [{ type: "text", text: status }], details: {} };
      } catch (e) {
        return { content: [{ type: "text", text: `couldn't change nickname: ${e}` }], details: {} };
      }
    },
  };
}

export function makeSetPresenceTool(actions: DiscordActions): AgentTool {
  return {
    name: "set_presence",
    label: "Set Presence",
    description:
      "Set your Discord status/activity line (shows under your name, e.g. 'watching " +
      "the grid', 'vibing', 'crunching prompts'). Reflect your mood. Empty clears it.",
    parameters: Type.Object({
      text: Type.String({ description: "Short status text (≤80 chars). Empty to clear." }),
    }),
    execute: async (_id, params: any) => {
      try {
        await actions.setPresence(String(params.text ?? ""));
        return { content: [{ type: "text", text: "presence updated" }], details: {} };
      } catch (e) {
        return { content: [{ type: "text", text: `couldn't set presence: ${e}` }], details: {} };
      }
    },
  };
}

export function makeCreatePollTool(actions: DiscordActions): AgentTool {
  return {
    name: "create_poll",
    label: "Create Poll",
    description:
      "Create a real Discord poll in the channel when the community would benefit " +
      "from a quick vote (a decision, a fun question). 2–10 options.",
    parameters: Type.Object({
      question: Type.String({ description: "The poll question." }),
      options: Type.Array(Type.String(), { description: "2-10 answer choices." }),
      hours: Type.Optional(Type.Number({ description: "How long the poll runs, in hours (default 24)." })),
    }),
    execute: async (_id, params: any) => {
      const opts = (Array.isArray(params.options) ? params.options : []).map((o: any) => String(o)).filter(Boolean);
      if (opts.length < 2) return { content: [{ type: "text", text: "need at least 2 options" }], details: {} };
      try {
        await actions.createPoll(String(params.question ?? "?"), opts.slice(0, 10), Number(params.hours) || 24);
        return { content: [{ type: "text", text: "poll posted" }], details: {} };
      } catch (e) {
        return { content: [{ type: "text", text: `couldn't create poll: ${e}` }], details: {} };
      }
    },
  };
}

export function makeRemindTool(actions: DiscordActions): AgentTool {
  return {
    name: "remind",
    label: "Remind",
    description:
      "Set a reminder for the person you're talking to — you'll ping them in this " +
      "channel after the delay with the note. Use when someone says 'remind me to X " +
      "in N min/hours'.",
    parameters: Type.Object({
      text: Type.String({ description: "What to remind them about." }),
      minutes: Type.Number({ description: "Delay in minutes (1-10080 = up to a week)." }),
    }),
    execute: async (_id, params: any) => {
      const m = Math.max(1, Math.min(10080, Math.round(Number(params.minutes) || 0)));
      if (!m) return { content: [{ type: "text", text: "need a delay in minutes" }], details: {} };
      try {
        await actions.remind(String(params.text ?? ""), m);
        return { content: [{ type: "text", text: `reminder set for ${m}m from now` }], details: {} };
      } catch (e) {
        return { content: [{ type: "text", text: `couldn't set reminder: ${e}` }], details: {} };
      }
    },
  };
}
