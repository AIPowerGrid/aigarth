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
  `withLogContext` uses AsyncLocalStorage to bind turn/message/channel IDs across
  awaits without mixing concurrent channels. Scoped IDs override caller metadata.

## Local Contracts

- Any new code that fetches a user-supplied URL server-side MUST use `net.ts` — never a raw
  `fetch`. The guard fails closed (returns null / false on any uncertainty).
- Host allow/deny matching uses parsed hosts (`hostOf` / registered host), never substrings.
- Read stdout AND stderr: warnings/errors go to stderr, info/debug to stdout.
  Correlation IDs and bounded timing/status metadata are allowed; raw tool arguments,
  credentials, message content and private model reasoning are not turn telemetry.

## Work Guidance

`npm test` includes concurrent correlation isolation on stdout and stderr.

## Verification

—

## Child DOX Index

- None — leaf.
