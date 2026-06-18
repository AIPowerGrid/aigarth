# AI Power Grid — current architecture (2026)

This describes the **current** Grid infrastructure. (Note: the "Base migration"
and "bridge migration" docs are about the *token* moving chains — a separate,
older topic. This doc is about the *inference network*.)

## Two endpoints, mid-migration

The Grid is moving from a legacy stack to a new one. Both are live right now:

- **`grid.aipowergrid.io`** — the **new stack** (system-core). Serves an
  **OpenAI-compatible `/v1`** API (chat completions, with faithful tool-calling
  passthrough). This is what aipg.chat and aigarth use. Currently serves
  `gpt-oss-120b`.
- **`api.aipowergrid.io`** — the **legacy horde** (the older Flask-based system,
  `/api/v2/...`). Most GPU workers still register here: the other text models
  (llama, qwen, groq) and the image workers (`z-image-turbo`, `flux.2 klein`).

So today, chat (gpt-oss) is on the new grid; the other text models and image
generation are still on the legacy horde. They run side by side during the
cutover.

## The plan (cutover)

The goal is **one canonical endpoint**: point `api.aipowergrid.io/v1` at the new
system-core, migrate the remaining workers off the legacy horde onto it, keep
`grid.aipowergrid.io` as a temporary alias, then decommission the legacy horde.
After that there's a single `api.aipowergrid.io/v1` (no `/api/v2`).

## How inference works

Users submit to the Grid (chat via `/v1/chat/completions`, images via the horde
async API). The Grid dispatches the job to a worker advertising that model; the
worker runs it on its GPU and streams the result back. Workers earn AIPG for the
work they do (see rewards-and-settlement).

## API keys

The two stacks have **separate keys** during the migration: a `grid.` key is not
valid on `api.` and vice-versa. Each is issued per-account by its system.
