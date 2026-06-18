import { config } from "../config.js";
import { log } from "../util/log.js";

/**
 * The LLM gate: for a message the bot wasn't directly addressed in, a fast model
 * decides — like a real community member would — whether to jump in, drop a quick
 * emoji react, or stay out. This replaces the old dumb probability heuristic and
 * brings back the "AI decides whether to chime in" feel, cheaply.
 *
 * Fast path: reasoning_effort=low + tiny output → ~0.5s on gpt-oss. Fails CLOSED
 * (ignore) on any error/timeout — silence is the safe default for unprompted chat.
 */

export interface GateDecision {
  action: "respond" | "react" | "ignore";
  emoji?: string;
}

export async function decideProactive(text: string, history: string, userName: string): Promise<GateDecision> {
  if (!config.gridApiKey) return { action: "ignore" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${config.gridV1Url.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.gridApiKey}` },
      body: JSON.stringify({
        model: config.gridGateModel,
        max_tokens: 128,
        temperature: 0,
        reasoning_effort: "low",
        messages: [
          {
            role: "system",
            content:
              `You decide whether ${config.botName} — a friendly, knowledgeable AI Power Grid ` +
              `community member — should jump into a message it was NOT directly addressed in.\n\n` +
              `Choose RESPOND when there's a real opening to HELP: someone asks a question you ` +
              `could answer (ESPECIALLY about AIPG, the grid, workers, rewards, crypto, tech, or ` +
              `running a node), someone's confused or stuck, or there's a useful correction/take ` +
              `to add. An unanswered question you can help with is the BEST time to speak up — ` +
              `don't stay quiet just because you weren't named.\n` +
              `Choose REACT <emoji> for light social moments (greetings, jokes, celebrations).\n` +
              `Choose IGNORE for private back-and-forth between specific people, pure small talk ` +
              `you'd add nothing to, or things clearly not for you.\n\n` +
              `Be helpful but not spammy. Reply with EXACTLY one of: RESPOND, REACT <emoji>, IGNORE.`,
          },
          { role: "user", content: `Recent chat:\n${history || "(start of conversation)"}\n\nLatest from ${userName}: ${text}\n\nWhat should ${config.botName} do?` },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { action: "ignore" };
    const data = (await res.json()) as any;
    const msg = data?.choices?.[0]?.message ?? {};

    // Parse the VERDICT from `content` (the clean answer). The reasoning channel
    // contains all three words as the model deliberates, so only fall back to it
    // if content is empty (rare at 128 tokens), and don't trust a keyword grep of
    // reasoning beyond that.
    const parse = (s: string): GateDecision | null => {
      const u = s.toUpperCase();
      const m = u.match(/REACT\s*([\p{Emoji}‍️]+)/u);
      if (m) return { action: "react", emoji: m[1] };
      if (u.includes("RESPOND")) return { action: "respond" };
      if (u.includes("REACT")) return { action: "react", emoji: "👍" };
      if (u.includes("IGNORE")) return { action: "ignore" };
      return null;
    };
    return parse(msg.content ?? "") ?? parse(msg.reasoning_content ?? "") ?? { action: "ignore" };
  } catch (e) {
    log.debug("gate error (ignoring)", { err: String(e) });
    return { action: "ignore" };
  } finally {
    clearTimeout(t);
  }
}
