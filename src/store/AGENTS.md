# src/store — local state (better-sqlite3)

## Purpose

Synchronous, single-process operational state: message history, rolling channel summaries,
per-channel status, settings, persisted moderation votes, per-user memory preferences, and
local per-user facts. Replaces the legacy `conversation_db.py`.

## Ownership

- `db.ts` — the single DB handle + idempotent schema upgrades (WAL, busy_timeout,
  foreign_keys) and exported APIs: `messages` (message-ID exclusion, character-budgeted
  history, summary batches), `channelSummaries`, `channelStatus`, `settings`, `userMemory`,
  `reminders` (persisted; a timer in `index.ts` delivers due ones), `banVotes`. Exposes `db`.

## Local Contracts

- Operational state + **local per-user memory** (`userMemory`: durable facts about a
  person, exact-deduped, capped per user) — the user-controlled memory layer; hindsight
  (`memory.ts`) is an additional optional semantic layer, not a replacement.
- Timestamps are UTC epoch-ms INTEGER; recency is ordered by `id` (collision-free), not `ts`.
- Stored content is length-clamped (`MAX_CONTENT`); `settings` is typed config
  (e.g. chattiness 1–10), not free-form memory.
- Credential-shaped values are redacted on transcript writes and legacy rows are scrubbed
  at startup. The current live message remains available to its immediate turn.
- `!memory off` disables and clears personal facts. It does not delete retained channel
  messages or shared channel summaries; those follow channel retention.
- Moderation votes are persisted and survive restarts; resolved/expired via flags, not deletion.
  Active votes are queryable by target and source message so duplicate moderation polls are suppressed
  and deletion of a flagged source can be observed without losing the vote.
- This is the only module that opens the sqlite DB; everything else uses these APIs.

## Work Guidance

—

## Verification

—

## Child DOX Index

- None — leaf.
