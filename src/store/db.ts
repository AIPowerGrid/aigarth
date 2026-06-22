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
  channel_id  TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_id   TEXT,
  content     TEXT NOT NULL,
  is_bot      INTEGER NOT NULL DEFAULT 0,
  ts          INTEGER NOT NULL              -- UTC epoch ms
);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, id DESC);

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

// Idempotent migration: add the action/target_msg_id columns to ban_votes tables
// created before community ban/delete polls existed (a live db won't get them
// from CREATE IF NOT EXISTS). Each ALTER throws if the column is already there.
for (const stmt of [
  "ALTER TABLE ban_votes ADD COLUMN action TEXT NOT NULL DEFAULT 'moderate'",
  "ALTER TABLE ban_votes ADD COLUMN target_msg_id TEXT",
]) {
  try {
    db.exec(stmt);
  } catch {
    /* column already exists */
  }
}

const clamp = (s: string) => (s.length > MAX_CONTENT ? s.slice(0, MAX_CONTENT) : s);

// ── messages ────────────────────────────────────────────────────────────
const insMsg = db.prepare(
  "INSERT INTO messages (channel_id, author_name, author_id, content, is_bot, ts) VALUES (?,?,?,?,?,?)",
);
const selRecent = db.prepare(
  "SELECT author_name, author_id, content, is_bot, ts FROM messages WHERE channel_id = ? ORDER BY id DESC LIMIT ?",
);
const delOld = db.prepare("DELETE FROM messages WHERE ts < ?");

export interface StoredMessage {
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
  add(channelId: string, author: string, content: string, authorId: string | null, isBot: boolean) {
    insMsg.run(channelId, author, authorId, clamp(content), isBot ? 1 : 0, Date.now());
  },
  recent(channelId: string, limit: number): StoredMessage[] {
    return (selRecent.all(channelId, limit) as StoredMessage[]).reverse(); // chronological
  },
  /** Format the last `limit` messages as a transcript for prompt context, with a
   *  relative-time marker inserted whenever there's a big gap so the model can tell
   *  a continuous conversation from one resuming hours later. */
  formatRecent(channelId: string, limit: number): string {
    const rows = this.recent(channelId, limit);
    if (rows.length === 0) return "";
    const out: string[] = [];
    let prevTs = 0;
    for (const m of rows) {
      if (prevTs && m.ts - prevTs > 10 * 60_000) out.push(`  ⋯ (${ago(m.ts - prevTs)} later)`);
      out.push(`${m.author_name}: ${m.content}`);
      prevTs = m.ts;
    }
    return out.join("\n");
  },
  cleanup(daysToKeep: number): number {
    return delOld.run(Date.now() - daysToKeep * 86_400_000).changes as number;
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

// ── per-user memory (local, always-on; durable facts about a person) ──────
const insFact = db.prepare("INSERT INTO user_facts (user_id, user_name, fact, ts) VALUES (?,?,?,?)");
const selFacts = db.prepare("SELECT fact FROM user_facts WHERE user_id = ? ORDER BY id DESC LIMIT ?");
const dupFact = db.prepare("DELETE FROM user_facts WHERE user_id = ? AND fact = ?");
const pruneFacts = db.prepare(
  "DELETE FROM user_facts WHERE user_id = ? AND id NOT IN (SELECT id FROM user_facts WHERE user_id = ? ORDER BY id DESC LIMIT ?)",
);

export const userMemory = {
  /** Save a durable fact about a user. Exact dupes are de-duplicated (newest wins),
   *  and each user is capped at `max` facts. */
  add(userId: string, userName: string, fact: string, max: number) {
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
