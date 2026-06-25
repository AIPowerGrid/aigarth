import { config } from "../config.js";
import { log } from "../util/log.js";

/**
 * Engagement gate — a cheap, fast model that decides how aigarth should treat a
 * message that ISN'T a structural fast-path (@-mention / reply-to-bot / DM, which
 * always respond and skip this). It judges everything addressing-related the way a
 * person would — the name in any spelling ("aigarth", "ai garth", "garth", typos),
 * implicit address, or whether unaddressed chatter is worth chiming into — so there
 * is NO name matcher. The full chat model only runs when this returns `respond`.
 *
 * Fails CLOSED (ignore) on any error/timeout — silence is the safe default.
 */
export type GateAction = "respond" | "react" | "ignore";
export interface GateDecision {
  action: GateAction;
  emoji?: string;
}

function parseVerdict(s: unknown): GateDecision | null {
  if (!s) return null;
  const u = String(s).toUpperCase();
  const m = u.match(/REACT\s*([\p{Emoji}‍️]+)/u);
  if (m) return { action: "react", emoji: m[1] };
  if (u.includes("RESPOND")) return { action: "respond" };
  if (u.includes("REACT")) return { action: "react", emoji: "👍" };
  if (u.includes("IGNORE")) return { action: "ignore" };
  return null;
}

export async function decideEngagement(opts: {
  history: string;
  latest: string;
  userName: string;
  recentlyEngaged: boolean;
  chattiness: number;
}): Promise<GateDecision> {
  if (!config.gridApiKey) return { action: "ignore" };
  const bot = config.botName;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${config.gridV1Url.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.gridApiKey}` },
      body: JSON.stringify({
        model: config.gridGateModel,
        max_tokens: 64,
        temperature: 0,
        reasoning_effort: "low",
        messages: [
          {
            role: "system",
            content:
              `You are the attention filter for ${bot}, a friendly member of the AI Power Grid ` +
              `Discord. Decide how ${bot} should treat the LATEST message given the recent chat. ` +
              `Answer with EXACTLY one of:\n` +
              `RESPOND — anyone is talking TO ${bot}: using its name in ANY spelling/form (e.g. ` +
              `"${bot}", "ai garth", "garth", typos), @-mentioning it, replying to it, asking it ` +
              `something, or clearly directing a message at it. ALSO RESPOND to an unaddressed ` +
              `message only when there's a real opening to genuinely help (an AIPG / grid / worker / ` +
              `crypto / tech question that needs answering, or someone clearly stuck).\n` +
              `REACT <emoji> — RARELY, only for a genuinely notable social moment (a real ` +
              `celebration, a joke that truly lands, someone thanking ${bot} directly). Never just ` +
              `to acknowledge a message.\n` +
              `IGNORE — the DEFAULT. Ordinary chatter between other people, small talk, or anything ` +
              `not meant for ${bot}. Most messages that don't address ${bot} are IGNORE.\n` +
              (opts.recentlyEngaged
                ? `${bot} engaged here very recently — lean even harder toward IGNORE unless it's directly addressed. `
                : ``) +
              `Chattiness is ${opts.chattiness}/10 (higher = a little more willing to chime into ` +
              `unaddressed chatter; it never changes responding when directly addressed).`,
          },
          {
            role: "user",
            content: `Recent chat:\n${opts.history || "(start of conversation)"}\n\nLATEST — ${opts.userName}: ${opts.latest}\n\nWhat should ${bot} do?`,
          },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { action: "ignore" };
    const data = (await res.json()) as any;
    const msg = data?.choices?.[0]?.message ?? {};
    return parseVerdict(msg.content) ?? parseVerdict(msg.reasoning_content) ?? { action: "ignore" };
  } catch (e) {
    log.debug("gate error (ignoring)", { err: String(e) });
    return { action: "ignore" };
  } finally {
    clearTimeout(t);
  }
}
