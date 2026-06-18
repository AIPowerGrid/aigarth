import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { getMemory } from "../memory.js";

/**
 * remember / recall skills — long-term agent memory via hindsight.
 *
 * Replaces aigarth's full-dump key/value memory. The model decides when to
 * store a durable fact and when to look one up; recall is semantic + tagged, so
 * we never blow the context window dumping everything. Per-turn tags (user,
 * channel) are injected so memories can be scoped.
 */
export function makeRememberTool(getTags: () => string[]): AgentTool {
  return {
    name: "remember",
    label: "Remember",
    description:
      "Store a durable fact worth remembering long-term (a user preference, a " +
      "decision, a community fact). Don't store trivia or whole conversations.",
    parameters: Type.Object({
      fact: Type.String({ description: "The fact to remember, stated plainly." }),
      about: Type.Optional(Type.String({ description: "Optional subject/context for the fact." })),
    }),
    execute: async (_id, params: any) => {
      const mem = await getMemory();
      if (!mem.enabled) {
        return { content: [{ type: "text", text: "(memory not configured)" }], details: {} };
      }
      await mem.remember(String(params.fact), { tags: getTags(), context: params.about });
      return { content: [{ type: "text", text: "noted" }], details: {} };
    },
  };
}

export function makeRecallTool(getTags: () => string[]): AgentTool {
  return {
    name: "recall",
    label: "Recall",
    description:
      "Search your long-term memory for relevant facts before answering when the " +
      "user references something personal or past ('what did I say about…', " +
      "'remember when…').",
    parameters: Type.Object({
      query: Type.String({ description: "What to recall." }),
    }),
    execute: async (_id, params: any) => {
      const mem = await getMemory();
      if (!mem.enabled) {
        return { content: [{ type: "text", text: "(memory not configured)" }], details: { count: 0 } };
      }
      const hits = await mem.recall(String(params.query), { tags: getTags() });
      if (hits.length === 0) {
        return { content: [{ type: "text", text: "No relevant memories." }], details: { count: 0 } };
      }
      return {
        content: [{ type: "text", text: hits.map((h, i) => `[${i + 1}] ${h}`).join("\n") }],
        details: { count: hits.length },
      };
    },
  };
}
