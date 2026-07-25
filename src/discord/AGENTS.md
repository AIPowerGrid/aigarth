# src/discord — live room context + participation + mechanical backstops

## Purpose

The Discord behavior layer: live human-visible room context, the capable engagement **judge**,
turn revalidation, mechanical cost/abuse limits, the deterministic scam screen, the
community-vote moderation engine, and `!` commands. Every eligible focus is judged;
@-mention / reply / DM / name use are contextual signals, not automatic response paths.

## Ownership

- `gate.ts` — `decideEngagement`: a `gridGateModel` call (defaults to the same 120B model as
  chat) that returns strict JSON for `respond` | `react` | `ignore` on every focus. It
  receives structural and current-room context, treats silence as healthy, and fails CLOSED
  on errors, timeout, or malformed output. A response includes either a short grounded reply
  or `needs_tools=true`; open-ended analysis is conservatively escalated to the full agent.
- `context.ts` — fetches and formats the current Discord window immediately before judgment.
  It includes human and bot messages, reply attribution/previews, attachment/embed/reaction/
  sticker metadata, and room name/topic/category; marks `[FOCUS]` and `[NOW]`; keeps focus
  under the character budget; synchronizes visible messages into SQLite by stable ID; and
  falls back to the privacy-filtered local transcript when Discord history is unavailable.
- `turn.ts` — orchestrates context → gate → plain reply or full agent → post. It reacts only
  when focus is still `[NOW]`, and re-fetches/re-judges a changed room before a slow full-agent
  result may post. Still-open addressed work is requeued; obsolete work closes quietly.
- `gating.ts` — mechanical backstops, no content reads: `isCommand`, rolling per-minute reply
  ceiling (`recordBotSend`/`canSend`), `botSpokeRecently` (the gate's "engaged recently" signal).
  All in-memory maps. (The old regex `decideEngagement`/`isAddressed` is gone — the gate decides.)
- `scam.ts` — deterministic, **fail-closed** scam screen (`screenMessage`): every Discord
  invite except the configured published AIPG code; support/admin impersonation paired with
  a non-AIPG destination; or wallet-drainer phrasing + an untrusted link. The source is
  persisted before screening and the poll receives a redacted snapshot, so flash deletion
  cannot erase evidence. High-confidence detections open an explicit, deduplicated ban poll.
  Trust uses parsed hosts and exact invite codes, never substrings. **Community-vote engine**
  `openModerationVote` / `openBanVote` / `handleVoteReaction` / `enforce`: persisted human-only vote on
  `action` = `moderate` | `ban` | `delete`; `ban`→ban, `delete`→remove the message,
  `moderate`→`SCAM_OUTCOME` (reversible timeout default). `BAN_VOTE_THRESHOLD` ✅ enact; bot
  never self-votes. Failed Discord enforcement leaves the vote active for retry, and bans use the
  target user ID so leaving the guild does not evade a passed vote. Backs BOTH the scam screen and
  the agent's poll tools.
- `commands.ts` — `handleCommand`: `!help`; user-owned `!memory [on|off]` and
  `!forget <phrase|all>`; admin `!chattiness` / `!remember` / `!upload` / `!list` /
  `!delete`. Doc commands operate on `docs/store.ts`.

## Local Contracts

- Only `gate.ts` may call an LLM directly in this subtree, and only `gridGateModel`; the
  tool-capable chat agent remains `../agent.ts`. Gate and final-editor failures fail closed.
- The transcript from `context.ts` is the authority for current conversational state.
  Never infer "latest" from arrival order alone, omit other bots, or remove newer messages
  merely because the focus is older.
- Fail-safe defaults: the scam screen fails closed; all moderation (scam OR agent-proposed)
  resolves via human vote, never unilaterally — the bot never self-votes.
- Cost/abuse backstops (`userCooldownMs`, `maxRepliesPerMin`, `selfThrottleMs`) come from
  `config.ts`; `index.ts` must respect them before running the agent.
- Scam host trust uses `registeredHost` over parsed hosts (via `util/net.ts`), never substrings.
- `OFFICIAL_DISCORD_INVITE_CODES` is an exact allowlist. Keep it synchronized with the
  invite published on the website/docs; never allow every `discord.gg` destination.
- The bot role needs View Channel, Send Messages, Embed Links, Add Reactions, Read Message
  History, and Ban Members in moderated guilds, and its role must sit above ordinary member
  roles. Startup and ban-poll text warn when Ban Members is absent; never claim enforcement
  succeeded when Discord permissions prevent it.

## Work Guidance

—

## Verification

- Hermetic: `npm test` covers context formatting/budgets, stable-ID sync, gate parsing,
  response-engine escalation, and coalescing.
- Live Grid: `npm run eval` and `npm run eval:conversation`.
- Live Discord, read-only: `npm run eval:discord-context`.

## Child DOX Index

- None — leaf.
