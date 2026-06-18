# src/util — shared utilities

## Purpose

Cross-cutting helpers: the SSRF guard for all server-side URL fetches, and the structured
logger.

## Ownership

- `net.ts` — `isSafePublicUrl` (blocks localhost/private/link-local/cloud-metadata, resolves
  DNS), `safeFetchText` / `safeFetchBuffer` (guarded + size/time-capped), `extractUrls`,
  `hostOf`. **Every user-supplied-URL fetch in the app routes through here.**
- `log.ts` — `log.{debug,info,warn,error}`: JSON-line console logger (pipe to the process
  manager for persistence). Replaces the old blocking file-append logging.

## Local Contracts

- Any new code that fetches a user-supplied URL server-side MUST use `net.ts` — never a raw
  `fetch`. The guard fails closed (returns null / false on any uncertainty).
- Host allow/deny matching uses parsed hosts (`hostOf` / registered host), never substrings.

## Work Guidance

—

## Verification

—

## Child DOX Index

- None — leaf.
