# src/discord — mechanical backstops + moderation (off the LLM path)

## Purpose

The non-AI parts of ingestion: mechanical cost/abuse limits, the deterministic scam screen,
the community-vote moderation engine, and `!` commands. The *decision* of whether/how to
engage is NOT here — it's the agent's (see `../agent.ts`); this layer only provides safety
limits plus the machinery the agent's moderation tools and the scam screen both drive.

## Ownership

- `gating.ts` — mechanical backstops ONLY, no content reads: `isCommand`, per-user
  `passCooldown`, rolling per-minute reply ceiling (`recordBotSend`/`canSend`), and
  `botSpokeRecently` (a context signal the model is shown). All in-memory maps. (The old
  `decideEngagement`/`isAddressed`/`isDismissal` regex is gone — the model decides.)
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

- This layer is deterministic and must not invoke the agent. It reads no message content to
  decide engagement (only `screenMessage` inspects content, for the fail-closed scam screen).
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
