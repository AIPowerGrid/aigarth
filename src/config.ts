import "dotenv/config";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function list(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function num(name: string, def: number): number {
  const v = process.env[name];
  return v ? Number(v) : def;
}

export const config = {
  // Discord
  discordToken: req("DISCORD_TOKEN"),
  botName: process.env.BOT_NAME ?? "aigarth",
  /** Channels the bot actively responds in (empty = any it can see). */
  channels: list("BOT_CHANNELS"),
  /** Channels it stores history from but never responds in. */
  readonlyChannels: list("BOT_READONLY_CHANNELS"),
  adminUserIds: list("ADMIN_USER_IDS"),

  // Grid — the agent's brain runs on our OWN grid (dogfooding).
  gridApiKey: req("GRID_API_KEY"),
  gridV1Url: process.env.GRID_V1_URL ?? "https://api.aipowergrid.io/v1",
  gridChatModel: process.env.GRID_CHAT_MODEL ?? "gpt-oss-120b",
  gridContextWindow: num("GRID_CONTEXT_WINDOW", 32000),
  gridMaxTokens: num("GRID_MAX_TOKENS", 2048),
  // Chat sampling. The old (more natural) JSON-era bot used temp 0.7 / top_p 0.92
  // / top_k 100 / rep_pen 1.1 — pi-ai's defaults left these unset, which is why
  // the new bot felt flat and repeated openers ("Hey half… 🚀 / Hey half… 🚀").
  // Injected into every Grid call via agent.ts onPayload (vLLM honors top_k +
  // repetition_penalty; frequency/presence are OpenAI-standard backstops).
  chatTemperature: num("CHAT_TEMPERATURE", 0.7),
  chatTopP: num("CHAT_TOP_P", 0.92),
  chatTopK: num("CHAT_TOP_K", 100),
  chatRepetitionPenalty: num("CHAT_REPETITION_PENALTY", 1.1),
  chatFrequencyPenalty: num("CHAT_FREQUENCY_PENALTY", 0.3),
  chatPresencePenalty: num("CHAT_PRESENCE_PENALTY", 0.2),

  // Image gen (Horde async API). NOTE: api.aipowergrid.io and grid.aipowergrid.io
  // are SEPARATE deployments with SEPARATE keys — chat lives on grid., images +
  // horde status on api.. So the image key can differ from GRID_API_KEY.
  gridImageBaseUrl: process.env.GRID_IMAGE_BASE_URL ?? "https://api.aipowergrid.io",
  gridImageApiKey: process.env.GRID_IMAGE_API_KEY ?? process.env.GRID_API_KEY ?? "",
  // Grid status/horde API host (status, workers, models).
  gridStatusUrl: process.env.GRID_STATUS_URL ?? "https://api.aipowergrid.io",

  // Vision — a SEPARATE, image-capable model (the chat model usually isn't).
  // Empty disables the describe_image skill. Its own /v1 base can differ.
  gridVisionModel: process.env.GRID_VISION_MODEL ?? "",
  gridVisionV1Url: process.env.GRID_VISION_V1_URL ?? process.env.GRID_V1_URL ?? "https://api.aipowergrid.io/v1",

  // Doc RAG retrieval microservice (Python, wraps ChromaDB).
  retrievalUrl: process.env.RETRIEVAL_URL ?? "http://127.0.0.1:8088",
  retrievalApiKey: process.env.RETRIEVAL_API_KEY ?? "",

  // Agent memory — hindsight (optional; degrades to no-op if unset).
  hindsightUrl: process.env.HINDSIGHT_URL ?? "",
  hindsightApiKey: process.env.HINDSIGHT_API_KEY ?? "",
  hindsightBank: process.env.HINDSIGHT_BANK ?? "aigarth",

  // Crypto skill (CoinGecko).
  coingeckoApiKey: process.env.COINGECKO_API_KEY ?? "",
  coingeckoPro: process.env.COINGECKO_PRO === "true",

  // Local state DB (better-sqlite3): history, channel status, settings, votes.
  dbPath: process.env.STATE_DB_PATH ?? "./aigarth.db",

  // Behavior
  historyWindow: num("HISTORY_WINDOW", 10),
  // Per-user cooldown between full agent runs (ms) — cost/abuse control.
  userCooldownMs: num("USER_COOLDOWN_MS", 4000),
  // Per-channel cooldown for PROACTIVE (unaddressed) chime-ins — anti-spam.
  proactiveCooldownMs: num("PROACTIVE_COOLDOWN_MS", 90000),
  // Cheap/fast model that judges "should I chime in?" for proactive candidates
  // (second-stage gate after the free heuristic, before the full agent).
  gridGateModel: process.env.GRID_GATE_MODEL ?? "grid/llama-3.1-8b-instant",
  // Self-throttle: if the bot replied in a channel within this window, it's much
  // less likely to chime in proactively again (don't dominate).
  selfThrottleMs: num("SELF_THROTTLE_MS", 120000),
  // Beat before the typing indicator shows — a person doesn't start typing the
  // instant a message lands. Makes the chime-in feel less robotic.
  typingDelayMs: num("TYPING_DELAY_MS", 1000),
  // Hard backstop: max bot messages per channel per rolling minute (all kinds).
  maxRepliesPerMin: num("MAX_REPLIES_PER_MIN", 10),
  // Ban-vote thresholds (human votes; the bot does not self-vote in the port).
  banVoteThreshold: num("BAN_VOTE_THRESHOLD", 3),
  dismissVoteThreshold: num("DISMISS_VOTE_THRESHOLD", 3),
  banVoteTtlMs: num("BAN_VOTE_TTL_MS", 86_400_000),
  // Outcome of a successful scam vote: "timeout" (reversible) or "ban".
  scamOutcome: (process.env.SCAM_OUTCOME ?? "timeout") as "timeout" | "ban",
};

export type Config = typeof config;

export function isAdmin(userId: string): boolean {
  return config.adminUserIds.includes(userId);
}
