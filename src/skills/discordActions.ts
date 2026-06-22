import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";

/**
 * Discord actions as tools.
 *
 * Everything aigarth does in a channel is a tool call — there is no separate
 * "should I respond?" gate and no magic text channel. Speaking, reacting,
 * branching to a thread, and proposing moderation are all things the model
 * chooses to do (or not) by calling these. Staying silent = calling nothing.
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
        return { content: [{ type: "text", text: "sent in thread" }], details: {} };
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
