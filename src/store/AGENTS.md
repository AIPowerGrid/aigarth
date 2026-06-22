# src/store — local state (better-sqlite3)

## Purpose

Synchronous, single-process operational state: message history, per-channel status,
settings, persisted moderation votes, and local per-user memory. Replaces the legacy
`conversation_db.py`.

## Ownership

- `db.ts` — the single DB handle + schema (WAL, busy_timeout, foreign_keys) and the
  exported APIs: `messages` (history; `formatRecent` inserts a relative-time marker on
  big gaps), `channelStatus`, `settings`, `userMemory`, `banVotes`. Exposes `db`.

## Local Contracts

- Operational state + **local per-user memory** (`userMemory`: durable facts about a
  person, exact-deduped, capped per user) — the always-on memory layer; hindsight
  (`memory.ts`) is an additional optional semantic layer, not a replacement.
- Timestamps are UTC epoch-ms INTEGER; recency is ordered by `id` (collision-free), not `ts`.
- Stored content is length-clamped (`MAX_CONTENT`); `settings` is typed config
  (e.g. chattiness 1–10), not free-form memory.
- Moderation votes are persisted and survive restarts; resolved/expired via flags, not deletion.
- This is the only module that opens the sqlite DB; everything else uses these APIs.

## Work Guidance

—

## Verification

—

## Child DOX Index

- None — leaf.
