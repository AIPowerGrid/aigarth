# src/docs — agentic markdown doc store

## Purpose

Retrieval over the curated knowledge base WITHOUT vectors: the model reads whole docs or
greps for terms. For a small curated corpus this beats embeddings (full doc, debuggable,
no embeddings service).

## Ownership

- `store.ts` — `listDocs`, `readDoc`, `grepDocs`, `docIndex` (injected into the system
  prompt), plus admin `saveDoc` / `deleteDoc`. Operates on the repo-root `docs/*.md` dir,
  resolved relative to the compiled module.

## Local Contracts

- Doc content lives in the repo-root `docs/` directory (version-controlled), not here.
- All name handling goes through `safeName` (basename only, force `.md`) — no path traversal.
- `docIndex()` is the model's menu; it must reflect the actual files on disk.

## Work Guidance

—

## Verification

—

## Child DOX Index

- None — leaf.
