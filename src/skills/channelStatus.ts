import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { channelStatus } from "../store/db.js";

/**
 * set_channel_status — the model records a one-line summary of what's happening
 * in the current channel, for cross-channel awareness. Replaces the old
 * "classify call returns channel_status JSON" side-channel with a real tool the
 * model calls when the channel's state meaningfully changes.
 *
 * The current channel id/name are injected per-turn (see agent.ts) so the model
 * doesn't have to know them; it just provides the status text.
 */
export function makeSetChannelStatusTool(getCtx: () => { channelId: string; channelName: string } | null): AgentTool {
  return {
    name: "set_channel_status",
    label: "Set Channel Status",
    description:
      "Record a short (one sentence) summary of what's currently happening in " +
      "this channel, so you remember it next time and across channels. Call when " +
      "the topic/state has meaningfully changed.",
    parameters: Type.Object({
      status: Type.String({ description: "One-sentence summary of the channel right now." }),
    }),
    execute: async (_id, params: any) => {
      const ctx = getCtx();
      if (!ctx) {
        return { content: [{ type: "text", text: "no channel context" }], details: {} };
      }
      channelStatus.set(ctx.channelId, ctx.channelName, String(params.status));
      return { content: [{ type: "text", text: "channel status updated" }], details: {} };
    },
  };
}
