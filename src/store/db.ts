/**
 * Local state store (better-sqlite3) — synchronous, single-process, fast.
 *
 * Replaces aigarth's conversation_db.py. Audit fixes applied:
 *  - WAL + busy_timeout (no "database is locked" under concurrency)
 *  - UTC epoch-ms INTEGER timestamps; recency ordered by id (collision-free)
 *  - separate `settings` table (chattiness is config, not free-form memory)
 *  - persisted ban votes (survive restarts)
 *  - size/length budgets on stored content
 *
 * DROPPED from the old schema: mood, recent_happenings (dead code). Free-form
 * "memory" moves to hindsight (see memory.ts) — this DB holds only operational
 * state: message history, per-channel status, settings, and ban votes.
 */

import Database from "better-sqlite3";
import { config } from "../config.js";

const MAX_CONTENT = 4000;

const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id  TEXT,
  channel_id  TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_id   TEXT,
  content     TEXT NOT NULL,
  is_bot      INTEGER NOT NULL DEFAULT 0,
  ts          INTEGER NOT NULL              -- UTC epoch ms
);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, id DESC);

CREATE TABLE IF NOT EXISTS channel_summaries (
  channel_id         TEXT PRIMARY KEY,
  summary            TEXT NOT NULL,
  through_message_id INTEGER NOT NULL DEFAULT 0,
  updated_ts         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_status (
  channel_id   TEXT PRIMARY KEY,
  channel_name TEXT NOT NULL,
  status       TEXT NOT NULL,
  ts           INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_facts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   TEXT NOT NULL,
  user_name TEXT NOT NULL,        -- last-seen display name (for context phrasing)
  fact      TEXT NOT NULL,
  ts        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_facts ON user_facts(user_id, id DESC);

CREATE TABLE IF NOT EXISTS memory_preferences (
  user_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS reminders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  text       TEXT NOT NULL,
  due_ts     INTEGER NOT NULL,
  fired      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(fired, due_ts);

CREATE TABLE IF NOT EXISTS ban_votes (
  message_id    TEXT PRIMARY KEY,   -- the vote message id
  channel_id    TEXT NOT NULL,
  guild_id      TEXT NOT NULL,
  target_id     TEXT NOT NULL,      -- the user the vote concerns
  reason        TEXT NOT NULL,
  action        TEXT NOT NULL DEFAULT 'moderate', -- moderate | ban | delete
  target_msg_id TEXT,               -- the message to delete (action='delete')
  up_json       TEXT NOT NULL DEFAULT '[]',
  down_json     TEXT NOT NULL DEFAULT '[]',
  resolved      INTEGER NOT NULL DEFAULT 0,
  created_ts    INTEGER NOT NULL
);
`);

// Idempotent migrations for tables created by older releases. Each ALTER throws
// harmlessly when the column already exists.
for (const stmt of [
  "ALTER TABLE messages ADD COLUMN message_id TEXT",
  "ALTER TABLE ban_votes ADD COLUMN action TEXT NOT NULL DEFAULT 'moderate'",
  "ALTER TABLE ban_votes ADD COLUMN target_msg_id TEXT",
]) {
  try {
    db.exec(stmt);
  } catch {
    /* column already exists */
  }
}
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id) WHERE message_id IS NOT NULL");

const clamp = (s: string) => (s.length > MAX_CONTENT ? s.slice(0, MAX_CONTENT) : s);

/** Durable transcripts should not become a secret vault. The live message remains
 * available to the current turn, but credential-shaped values are redacted on disk. */
export function redactStoredContent(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[redacted-api-key]")
    .replace(
      /((?:api[_ -]?key|access[_ -]?token|private[_ -]?key|password)\s*(?:is|=|:)\s*)\S+/gi,
      "$1[redacted]",
    )
    .replace(/(seed[_ -]?phrase\s*(?:is|=|:)\s*).*$/gim, "$1[redacted]");
}

// Scrub legacy rows once on startup as well as all new writes.
const selStoredContent = db.prepare("SELECT id, content FROM messages");
const updateStoredContent = db.prepare("UPDATE messages SET content = ? WHERE id = ?");
const scrubStoredContent = db.transaction(() => {
  for (const row of selStoredContent.all() as Array<{ id: number; content: string }>) {
    const redacted = redactStoredContent(row.content);
    if (redacted !== row.content) updateStoredContent.run(redacted, row.id);
  }
});
scrubStoredContent();

// ── messages ────────────────────────────────────────────────────────────
const insMsg = db.prepare(
  "INSERT OR IGNORE INTO messages (message_id, channel_id, author_name, author_id, content, is_bot, ts) VALUES (?,?,?,?,?,?,?)",
);
const syncMsg = db.prepare(
  `UPDATE messages
   SET channel_id = ?, author_name = ?, author_id = ?, content = ?, is_bot = ?, ts = ?
   WHERE message_id = ?`,
);
const selRecent = db.prepare(
  `SELECT id, message_id, author_name, author_id, content, is_bot, ts
   FROM messages
   WHERE channel_id = ? AND (? IS NULL OR message_id IS NULL OR message_id != ?)
   ORDER BY id DESC LIMIT ?`,
);
const delOld = db.prepare("DELETE FROM messages WHERE ts < ?");
const selSummaryBatch = db.prepare(
  `SELECT id, message_id, author_name, author_id, content, is_bot, ts
   FROM messages WHERE channel_id = ? AND id > ? AND id < ? ORDER BY id ASC LIMIT ?`,
);

export interface StoredMessage {
  id: number;
  message_id: string | null;
  author_name: string;
  author_id: string | null;
  content: string;
  is_bot: number;
  ts: number;
}

/** Compact relative age, e.g. "3m" / "2h" / "1d". */
function ago(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export const messages = {
  add(
    channelId: string,
    author: string,
    content: string,
    authorId: string | null,
    isBot: boolean,
    messageId: string | null = null,
  ) {
    insMsg.run(messageId, channelId, author, authorId, clamp(redactStoredContent(content)), isBot ? 1 : 0, Date.now());
  },
  /** Upsert a Discord-visible message by its stable Discord ID. This keeps edits,
   * attachment/reaction metadata, and messages observed after an offline period
   * current without duplicating the bot's own posts. */
  sync(
    channelId: string,
    author: string,
    content: string,
    authorId: string | null,
    isBot: boolean,
    messageId: string,
    ts: number,
  ) {
    const safe = clamp(redactStoredContent(content));
    const updated = syncMsg.run(channelId, author, authorId, safe, isBot ? 1 : 0, ts, messageId);
    if (!updated.changes) {
      insMsg.run(messageId, channelId, author, authorId, safe, isBot ? 1 : 0, ts);
    }
  },
  recent(channelId: string, limit: number, excludeMessageId: string | null = null): StoredMessage[] {
    return (selRecent.all(channelId, excludeMessageId, excludeMessageId, limit) as StoredMessage[]).reverse();
  },
  /** Format the last `limit` messages as a transcript for prompt context. The bot's
   *  OWN past messages are marked "(you)" so it clearly recognizes what it already
   *  said and who it is in the conversation. A relative-time marker is inserted on
   *  big gaps so it can tell a continuous chat from one resuming hours later. */
  formatRecent(
    channelId: string,
    opts: { limit: number; maxChars: number; excludeMessageId?: string | null },
  ): string {
    const rows = this.recent(channelId, opts.limit, opts.excludeMessageId ?? null);
    if (rows.length === 0) return "";
    return formatRows(withinCharacterBudget(rows, opts.maxChars));
  },
  /** Old messages eligible for folding into a rolling summary. Keeps the newest
   * `keepRecent` messages verbatim and advances strictly after `afterId`. */
  summaryBatch(channelId: string, afterId: number, keepRecent: number, maxRecentChars: number, limit: number) {
    const recentRows = withinCharacterBudget(this.recent(channelId, keepRecent), maxRecentChars);
    const cutoff = recentRows[0]?.id;
    if (!cutoff) return { count: 0, throughId: afterId, transcript: "" };
    const rows = selSummaryBatch.all(channelId, afterId, cutoff, limit) as StoredMessage[];
    return {
      count: rows.length,
      throughId: rows.at(-1)?.id ?? afterId,
      transcript: formatRows(rows),
    };
  },
  cleanup(daysToKeep: number): number {
    return delOld.run(Date.now() - daysToKeep * 86_400_000).changes as number;
  },
};

function withinCharacterBudget(rows: StoredMessage[], maxChars: number): StoredMessage[] {
  const selected: StoredMessage[] = [];
  let chars = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const estimated = rows[i].author_name.length + rows[i].content.length + 24;
    if (selected.length > 0 && chars + estimated > maxChars) break;
    selected.push(rows[i]);
    chars += estimated;
  }
  return selected.reverse();
}

function formatRows(rows: StoredMessage[]): string {
  const out: string[] = [];
  let prevTs = 0;
  for (const m of rows) {
    if (prevTs && m.ts - prevTs > 10 * 60_000) out.push(`  ⋯ (${ago(m.ts - prevTs)} later)`);
    const who = m.is_bot ? `${m.author_name} (you)` : m.author_name;
    out.push(`${who}: ${m.content}`);
    prevTs = m.ts;
  }
  return out.join("\n");
}

// ── rolling channel summaries ───────────────────────────────────────────
const getSummary = db.prepare(
  "SELECT summary, through_message_id, updated_ts FROM channel_summaries WHERE channel_id = ?",
);
const upsertSummary = db.prepare(`
  INSERT INTO channel_summaries (channel_id, summary, through_message_id, updated_ts) VALUES (?,?,?,?)
  ON CONFLICT(channel_id) DO UPDATE SET
    summary=excluded.summary,
    through_message_id=excluded.through_message_id,
    updated_ts=excluded.updated_ts
  WHERE excluded.through_message_id > channel_summaries.through_message_id
`);

export interface ChannelSummary {
  summary: string;
  through_message_id: number;
  updated_ts: number;
}

export const channelSummaries = {
  get(channelId: string): ChannelSummary | null {
    return (getSummary.get(channelId) as ChannelSummary | undefined) ?? null;
  },
  set(channelId: string, summary: string, throughMessageId: number): boolean {
    return upsertSummary.run(channelId, clamp(summary), throughMessageId, Date.now()).changes > 0;
  },
};

// ── channel status ──────────────────────────────────────────────────────
const upsertStatus = db.prepare(`
  INSERT INTO channel_status (channel_id, channel_name, status, ts) VALUES (?,?,?,?)
  ON CONFLICT(channel_id) DO UPDATE SET channel_name=excluded.channel_name, status=excluded.status, ts=excluded.ts
`);
const getStatus = db.prepare("SELECT status FROM channel_status WHERE channel_id = ?");
const allStatus = db.prepare(
  "SELECT channel_id, channel_name, status, ts FROM channel_status ORDER BY ts DESC LIMIT ?",
);

export const channelStatus = {
  set(channelId: string, name: string, status: string) {
    upsertStatus.run(channelId, name, clamp(status), Date.now());
  },
  get(channelId: string): string | null {
    const r = getStatus.get(channelId) as { status: string } | undefined;
    return r?.status ?? null;
  },
  /** Recent channel summaries for cross-channel awareness, freshness-marked. */
  format(currentChannelId: string | null, limit = 8): string {
    const rows = allStatus.all(limit) as Array<{ channel_id: string; channel_name: string; status: string; ts: number }>;
    if (rows.length === 0) return "";
    const now = Date.now();
    return rows
      .map((r) => {
        const ageMin = Math.round((now - r.ts) / 60000);
        const here = r.channel_id === currentChannelId ? " ← YOU ARE HERE" : "";
        return `#${r.channel_name} (${ageMin}m ago): ${r.status}${here}`;
      })
      .join("\n");
  },
};

// ── settings (typed config: chattiness, etc.) ─────────────────────────────
const setSetting = db.prepare(
  "INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
);
const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");

export const settings = {
  set(key: string, value: string) {
    setSetting.run(key, value);
  },
  get(key: string): string | null {
    const r = getSetting.get(key) as { value: string } | undefined;
    return r?.value ?? null;
  },
  getChattiness(): number {
    const v = this.get("chattiness_level");
    const n = v ? parseInt(v, 10) : 5;
    return Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : 5;
  },
};

// ── per-user memory (local, user-controlled durable facts) ───────────────
const insFact = db.prepare("INSERT INTO user_facts (user_id, user_name, fact, ts) VALUES (?,?,?,?)");
const selFacts = db.prepare("SELECT fact FROM user_facts WHERE user_id = ? ORDER BY id DESC LIMIT ?");
const dupFact = db.prepare("DELETE FROM user_facts WHERE user_id = ? AND fact = ? COLLATE NOCASE");
const delFactLike = db.prepare("DELETE FROM user_facts WHERE user_id = ? AND fact LIKE ? COLLATE NOCASE");
const delAllFacts = db.prepare("DELETE FROM user_facts WHERE user_id = ?");
const getMemoryPreference = db.prepare("SELECT enabled FROM memory_preferences WHERE user_id = ?");
const setMemoryPreference = db.prepare(`
  INSERT INTO memory_preferences (user_id, enabled) VALUES (?,?)
  ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled
`);
const pruneFacts = db.prepare(
  "DELETE FROM user_facts WHERE user_id = ? AND id NOT IN (SELECT id FROM user_facts WHERE user_id = ? ORDER BY id DESC LIMIT ?)",
);

export const userMemory = {
  /** Save a durable fact about a user. Exact dupes are de-duplicated (newest wins),
   *  and each user is capped at `max` facts. */
  add(userId: string, userName: string, fact: string, max: number) {
    if (!this.isEnabled(userId)) return;
    const f = clamp(fact.trim());
    if (!f) return;
    dupFact.run(userId, f);
    insFact.run(userId, clamp(userName), f, Date.now());
    pruneFacts.run(userId, userId, Math.max(1, max));
  },
  /** Known facts about a user, oldest→newest. */
  list(userId: string, limit = 12): string[] {
    return (selFacts.all(userId, limit) as { fact: string }[]).map((r) => r.fact).reverse();
  },
  /** Delete facts about a user containing `text` (case-insensitive). Returns count. */
  forget(userId: string, text: string): number {
    const t = text.trim();
    if (!t) return 0;
    return delFactLike.run(userId, `%${t}%`).changes as number;
  },
  clear(userId: string): number {
    return delAllFacts.run(userId).changes as number;
  },
  isEnabled(userId: string): boolean {
    const row = getMemoryPreference.get(userId) as { enabled: number } | undefined;
    return row ? row.enabled === 1 : true;
  },
  setEnabled(userId: string, enabled: boolean): void {
    setMemoryPreference.run(userId, enabled ? 1 : 0);
  },
};

// ── reminders (persisted; delivered by a timer in index.ts) ───────────────
const insReminder = db.prepare(
  "INSERT INTO reminders (channel_id, user_id, text, due_ts) VALUES (?,?,?,?)",
);
const dueReminders = db.prepare("SELECT * FROM reminders WHERE fired = 0 AND due_ts <= ? ORDER BY due_ts LIMIT 20");
const fireReminder = db.prepare("UPDATE reminders SET fired = 1 WHERE id = ?");

export interface Reminder {
  id: number;
  channel_id: string;
  user_id: string;
  text: string;
  due_ts: number;
}

export const reminders = {
  add(channelId: string, userId: string, text: string, dueTs: number) {
    insReminder.run(channelId, userId, clamp(text), dueTs);
  },
  due(now: number): Reminder[] {
    return dueReminders.all(now) as Reminder[];
  },
  fire(id: number) {
    fireReminder.run(id);
  },
};

// ── ban votes (persisted) ─────────────────────────────────────────────────
const insVote = db.prepare(`
  INSERT INTO ban_votes (message_id, channel_id, guild_id, target_id, reason, action, target_msg_id, created_ts)
  VALUES (?,?,?,?,?,?,?,?)
`);
const getVote = db.prepare("SELECT * FROM ban_votes WHERE message_id = ? AND resolved = 0");
const setVoteSets = db.prepare("UPDATE ban_votes SET up_json = ?, down_json = ? WHERE message_id = ?");
const resolveVote = db.prepare("UPDATE ban_votes SET resolved = 1 WHERE message_id = ?");
const expireVotes = db.prepare("UPDATE ban_votes SET resolved = 1 WHERE resolved = 0 AND created_ts < ?");

export type VoteAction = "moderate" | "ban" | "delete";

export interface BanVote {
  message_id: string;
  channel_id: string;
  guild_id: string;
  target_id: string;
  reason: string;
  action: VoteAction;
  target_msg_id: string | null;
  up: string[];
  down: string[];
}

export const banVotes = {
  create(
    messageId: string,
    channelId: string,
    guildId: string,
    targetId: string,
    reason: string,
    action: VoteAction = "moderate",
    targetMsgId: string | null = null,
  ) {
    insVote.run(messageId, channelId, guildId, targetId, clamp(reason), action, targetMsgId, Date.now());
  },
  get(messageId: string): BanVote | null {
    const r = getVote.get(messageId) as any;
    if (!r) return null;
    return { ...r, up: JSON.parse(r.up_json), down: JSON.parse(r.down_json) };
  },
  setVotes(messageId: string, up: string[], down: string[]) {
    setVoteSets.run(JSON.stringify(up), JSON.stringify(down), messageId);
  },
  resolve(messageId: string) {
    resolveVote.run(messageId);
  },
  expire(ttlMs: number) {
    expireVotes.run(Date.now() - ttlMs);
  },
};

export { db };
