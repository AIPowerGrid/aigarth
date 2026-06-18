import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";

/**
 * react — let the agent respond with just an emoji (a lightweight ack), like the
 * old bot did. The agent can call this INSTEAD of replying with text when a full
 * message isn't warranted ("👍", "🔥", "✅"). The discord layer supplies the
 * actual reaction callback per-turn; `mark()` records that a reaction happened
 * so we don't also send an empty "nothing came back" fallback.
 */
export function makeReactTool(react: (emoji: string) => Promise<void>, mark: () => void): AgentTool {
  return {
    name: "react",
    label: "React",
    description:
      "React to the user's message with a single emoji instead of replying with " +
      "text. Use for quick acknowledgments (👍 ✅ 🔥 😄 👀) when a full reply " +
      "isn't needed. You can react AND stay silent (no text).",
    parameters: Type.Object({
      emoji: Type.String({ description: "A single emoji to react with." }),
    }),
    execute: async (_id, params: any) => {
      const emoji = String(params.emoji).trim();
      try {
        await react(emoji);
        mark();
        return { content: [{ type: "text", text: `reacted ${emoji}` }], details: {} };
      } catch (e) {
        return { content: [{ type: "text", text: `couldn't react: ${e}` }], details: {} };
      }
    },
  };
}
