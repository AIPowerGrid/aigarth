/**
 * Minimal structured logger. Replaces aigarth's ad-hoc synchronous `bot.log`
 * file appends (which blocked the event loop and grew unbounded). Console only;
 * pipe to your process manager / log shipper for persistence + rotation.
 */
type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = { t: new Date().toISOString(), level, msg, ...(meta ?? {}) };
  const out = level === "error" || level === "warn" ? console.error : console.log;
  out(JSON.stringify(line));
}

export const log = {
  debug: (m: string, meta?: Record<string, unknown>) => emit("debug", m, meta),
  info: (m: string, meta?: Record<string, unknown>) => emit("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit("error", m, meta),
};
