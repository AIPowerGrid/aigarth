# src/discord — deterministic ingestion (off the LLM path)

## Purpose

Everything that decides whether and how to engage BEFORE (and cheaper than) a full agent
run: response gating, the proactive chime-in gate, scam moderation, and `!` commands.

## Ownership

- `gating.ts` — `decideEngagement` → `addressed` | `candidate` | `skip`; addressed detection
  (mention/name/reply-to-bot/DM + recent-bot-spoke continuity), dismissal regex (stay silent
  on "shut up"/"not you"), per-user cooldown, per-channel proactive cooldown, and the rolling
  per-minute reply ceiling (`recordBotSend`/`canSend`). All in-memory maps.
- `proactiveGate.ts` — `decideProactive`: a cheap fast-model Grid call for `candidate`
  messages → `respond` | `react <emoji>` | `ignore`. **Fails closed (ignore)** on any error
  or 8s timeout. Parses the verdict from `content`, falling back to `reasoning_content`.
- `scam.ts` — deterministic, **fail-closed** scam screen (`screenMessage`): foreign Discord
  invites, or wallet-drainer phrasing + an untrusted link. Trust is by registered host
  (real URL parse, never substring). `openBanVote` / `handleVoteReaction` / `enforce`:
  persisted human-only vote, reversible timeout by default (`SCAM_OUTCOME`); bot never self-votes.
- `commands.ts` — `handleCommand`: `!help` (all), admin `!chattiness` / `!remember` /
  `!upload` / `!list` / `!delete`. Doc commands operate on `docs/store.ts`.

## Local Contracts

- This layer is deterministic and must not invoke the full agent. Only `proactiveGate.ts`
  may call the Grid, and only the cheap `gridGateModel`.
- Fail-safe defaults: proactive gate and scam screen both fail closed. Dismissal → silence
  (no acknowledgment), overriding addressed.
- Cost/abuse backstops (`userCooldownMs`, `proactiveCooldownMs`, `maxRepliesPerMin`,
  `selfThrottleMs`) come from `config.ts`; the gate must respect all of them.
- Scam host trust uses `registeredHost` over parsed hosts (via `util/net.ts`), never substrings.

## Work Guidance

—

## Verification

—

## Child DOX Index

- None — leaf.
