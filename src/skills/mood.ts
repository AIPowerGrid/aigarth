import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { settings } from "../store/db.js";

/**
 * Mood — aigarth's own current vibe, which it sets and which colors how it talks.
 * Persisted in `settings` so it carries across messages until the model changes it.
 * Re-animates the old bot's "mood" (which was dead code), now a real LLM-driven tool.
 */
export function getMood(): string {
  return settings.get("mood") ?? "";
}

export function makeSetMoodTool(): AgentTool {
  return {
    name: "set_mood",
    label: "Set Mood",
    description:
      "Set your CURRENT mood/vibe (e.g. 'chill', 'hyped about the grid', 'a little " +
      "grumpy', 'goofy'). It carries across messages and colors how you talk until " +
      "you change it. Use it when your mood genuinely shifts — don't overdo it.",
    parameters: Type.Object({
      mood: Type.String({ description: "Your mood in a few words. Pass an empty string to clear it." }),
    }),
    execute: async (_id, params: any) => {
      const mood = String(params.mood ?? "").slice(0, 200).trim();
      settings.set("mood", mood);
      return { content: [{ type: "text", text: mood ? `mood set: ${mood}` : "mood cleared" }], details: {} };
    },
  };
}

/**
 * set_chattiness — let aigarth self-tune its participation threshold (1–10),
 * the same dial admins set with !chattiness. The participation judge reads it.
 */
export function makeSetChattinessTool(): AgentTool {
  return {
    name: "set_chattiness",
    label: "Set Chattiness",
    description:
      "Adjust your participation threshold: 1 = very reserved, 10 = more socially " +
      "available. LOWER it when someone tells you to chill or you sense you're " +
      "dominating; raise it when the room clearly wants more. Direct addressing is " +
      "still judged rather than forcing a reply.",
    parameters: Type.Object({
      level: Type.Number({ description: "Chattiness 1-10." }),
    }),
    execute: async (_id, params: any) => {
      const n = Math.max(1, Math.min(10, Math.round(Number(params.level) || 5)));
      settings.set("chattiness_level", String(n));
      return { content: [{ type: "text", text: `chattiness set to ${n}/10` }], details: {} };
    },
  };
}
