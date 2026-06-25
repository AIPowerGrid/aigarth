# src/discord — ingestion gate + mechanical backstops + moderation

## Purpose

The pre-agent layer: the cheap engagement **gate** (an LLM, but a small fast one), mechanical
cost/abuse limits, the deterministic scam screen, the community-vote moderation engine, and
`!` commands. Whether/how to engage is decided by the gate (for non-fast-path messages) or
structurally (@-mention / reply / DM always respond); the full chat agent (`../agent.ts`)
only runs when there's a reply to make.

## Ownership

- `gate.ts` — `decideEngagement`: a cheap `gridGateModel` (gpt-oss-20b) call that returns
  `respond` | `react <emoji>` | `ignore` for messages that aren't a structural fast-path. It
  handles ALL addressing judgment — the bot's name in ANY spelling/form, implicit address,
  and whether unaddressed chatter is worth chiming into — so there is **no name matcher**.
  Fails CLOSED (ignore) on any error/8s timeout. The full agent runs only on `respond`.
- `gating.ts` — mechanical backstops, no content reads: `isCommand`, rolling per-minute reply
  ceiling (`recordBotSend`/`canSend`), `botSpokeRecently` (the gate's "engaged recently" signal).
  All in-memory maps. (The old regex `decideEngagement`/`isAddressed` is gone — the gate decides.)
- `scam.ts` — deterministic, **fail-closed** scam screen (`screenMessage`): foreign Discord
  invites, or wallet-drainer phrasing + an untrusted link. Trust by registered host (real
  URL parse, never substring). **Community-vote engine** `openModerationVote` (+ `openBanVote`
  wrapper for the scam path) / `handleVoteReaction` / `enforce`: persisted human-only vote on
  `action` = `moderate` | `ban` | `delete`; `ban`→ban, `delete`→remove the message,
  `moderate`→`SCAM_OUTCOME` (reversible timeout default). `BAN_VOTE_THRESHOLD` ✅ enact; bot
  never self-votes. Backs BOTH the scam screen and the agent's poll tools.
- `commands.ts` — `handleCommand`: `!help` (all), admin `!chattiness` / `!remember` /
  `!upload` / `!list` / `!delete`. Doc commands operate on `docs/store.ts`.

## Local Contracts

- Only `gate.ts` may call an LLM here, and only the cheap `gridGateModel` — never the full
  chat agent (that's `index.ts` → `agent.ts`, on `respond`). The gate fails closed (ignore).
- Fail-safe defaults: the scam screen fails closed; all moderation (scam OR agent-proposed)
  resolves via human vote, never unilaterally — the bot never self-votes.
- Cost/abuse backstops (`userCooldownMs`, `maxRepliesPerMin`, `selfThrottleMs`) come from
  `config.ts`; `index.ts` must respect them before running the agent.
- Scam host trust uses `registeredHost` over parsed hosts (via `util/net.ts`), never substrings.

## Work Guidance

—

## Verification

—

## Child DOX Index

- None — leaf.
