# src/store — local state (better-sqlite3)

## Purpose

Synchronous, single-process operational state: message history, per-channel status,
settings, and persisted ban votes. Replaces the legacy `conversation_db.py`.

## Ownership

- `db.ts` — the single DB handle + schema (WAL, busy_timeout, foreign_keys) and the four
  exported APIs: `messages`, `channelStatus`, `settings`, `banVotes`. Exposes `db`.

## Local Contracts

- Operational state only — NOT long-term memory (that's hindsight via `memory.ts`).
- Timestamps are UTC epoch-ms INTEGER; recency is ordered by `id` (collision-free), not `ts`.
- Stored content is length-clamped (`MAX_CONTENT`); `settings` is typed config
  (e.g. chattiness 1–10), not free-form memory.
- Ban votes are persisted and survive restarts; resolved/expired via flags, not deletion.
- This is the only module that opens the sqlite DB; everything else uses these APIs.

## Work Guidance

—

## Verification

—

## Child DOX Index

- None — leaf.
