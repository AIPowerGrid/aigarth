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

export function parseVerdict(s: unknown): GateDecision | null {
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
  untrustedLink?: boolean;
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
              `RESPOND if EITHER is true:\n` +
              `  (a) someone is talking TO ${bot} — its name in ANY spelling/form ("${bot}", ` +
              `"ai garth", "garth", typos), an @-mention, a reply to it, or a message clearly aimed at it;\n` +
              `  (b) the LATEST message is a genuine QUESTION or request for help ${bot} could answer — ` +
              `ESPECIALLY about AIPG, the grid, workers, rewards, nodes, running a node, crypto, or tech — ` +
              `EVEN IF not addressed to ${bot}. An unanswered question someone needs help with is ALWAYS RESPOND.\n` +
              `REACT <emoji> — RARELY, only for a genuinely notable social moment (a real ` +
              `celebration, a joke that truly lands, someone thanking ${bot} directly). Never just ` +
              `to acknowledge a message.\n` +
              (opts.untrustedLink
                ? `SECURITY: this message posts a link to an UNRECOGNIZED site. Choose RESPOND so ${bot} ` +
                  `can inspect it — if it's a scam / phishing / drainer / giveaway bait it should open a ` +
                  `ban poll; a normal link from a regular member is fine to leave alone.\n`
                : ``) +
              `IGNORE — ordinary chatter, statements, jokes, and small talk BETWEEN PEOPLE that are ` +
              `NOT a question or request ${bot} could help with, and not aimed at ${bot}. This is the ` +
              `default for non-questions — but NEVER ignore a genuine question (rule b above).\n` +
              `CREDIT CHECK: thanks/praise/comments are often for whoever ACTUALLY helped — and ` +
              `${bot}'s own past lines in the chat are tagged "(you)". If someone says "thank you" / ` +
              `"nice" and ${bot} did NOT visibly help them in the recent chat, it's meant for someone ` +
              `else → IGNORE. Never make ${bot} take credit or butt into other people's exchange.\n` +
              (opts.recentlyEngaged
                ? `${bot} is in an ACTIVE exchange here (it spoke recently) — KEEP answering questions ` +
                  `and continuing that conversation, including direct follow-ups. Only skip unrelated ` +
                  `idle chatter; never drop a genuine question just because ${bot} just spoke. `
                : ``) +
              `Chattiness is ${opts.chattiness}/10 (higher = a little more willing to chime into ` +
              `unaddressed chatter; it never changes responding when directly addressed or asked a question).`,
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
