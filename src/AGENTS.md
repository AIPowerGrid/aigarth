# src — application code (TypeScript, ESM)

## Purpose

The agent itself: the Discord ingestion + control loop, the Grid-backed tool-calling agent,
typed config, and the subsystems (skills, image registry, doc store, sqlite state, utils).

## Ownership

- `index.ts` — Discord client + `MessageCreate`/reaction handlers. **Conversation coalescing:
  ONE attention per channel.** Per-message ingestion (store history w/ mentions resolved →
  `!`commands → scam screen → eligibility → compute signals) feeds `noteActivity`; a short
  settle timer (`CONV_SETTLE_MS`, shorter when addressed) then runs **one** `runChannelTurn`
  per channel (serialized; re-runs if activity arrived during it), responding to the channel's
  *current* state — so it structurally can't answer stale messages or post out of order.
  `runChannelTurn` first checks the **participation judge** (`discord/gate.ts`, the configured
  capable Grid model → respond/react/ignore) for every message; @-mention/reply/DM are strong
  context but never bypass judgment. Only on `respond` does it build the per-turn **Discord surface** (`reply`/`react`/
  `reply_in_thread`/polls/`snooze`/presence/nickname/`create_poll`/`remind`) and call `runTurn`
  (hard-timeout-aborted via `TURN_TIMEOUT_MS`). Posted text is run through `unwrapToolCallText`
  (models sometimes emit a reply as literal JSON). Reminder-delivery + housekeeping timers +
  reaction vote tallying.
- `agent.ts` — `runTurn`: builds the persona prompt + per-turn context (who/where/history +
  how the message relates to the bot), constructs the pi `Agent`, registers tools (Discord
  actions + skills), applies human-sounding sampling (`onPayload`). Returns `finalText` only
  as an addressed-only safety net — real output goes out via the `reply` tool's side effect.
- `grid.ts` — the Grid as a `pi-ai` `Model<"openai-completions">` (custom `baseUrl`).
- `config.ts` — the ONE typed env surface (`config`, `isAdmin`); defaults + `.env.template`.
- `memory.ts` — long-term memory behind a `MemoryStore` interface; hindsight when configured,
  else a no-op (`NullMemory`). One swappable file.
- `conversationSummary.ts` — folds messages older than the verbatim window into a
  persisted channel summary using `GRID_SUMMARY_MODEL`; one refresh per channel.
- `memoryExtraction.ts` — strict-JSON, privacy-conservative extraction of up to two
  user-volunteered durable facts after successful interactions; honors per-user opt-out.
- `contextEval.ts` — live Grid eval for summary continuity and memory privacy behavior.
- `discord/`, `skills/`, `images/`, `docs/`, `store/`, `util/` — subsystems, each owned in
  its own AGENTS.md.
- `smoke.ts` — build-and-run smoke check (`npm run smoke`).

## Local Contracts

- **Persona vs context split:** `personaPrompt()` is stable system text (who you are + how
  acting = calling tools); per-turn channel / history / message / **how it relates to the
  bot** go in `contextBlock()`. Keep them separate (audit fix for robotic replies).
- **The model acts only through tools.** Speaking is the `reply` tool, not free text (free
  text is private scratch); reacting/threading/moderation likewise. Silence = no tool call.
  `index.ts` supplies the per-turn `DiscordActions` callbacks; `agent.ts` wraps them as tools.
- **Addressed messages bypass the per-user cooldown, not participation judgment.** A mention /
  reply-to-bot (even with the ping off — detected via the fetched referenced message) / DM is
  considered promptly, then the AI may still ignore it. The reply ceiling applies to everyone.
- **Don't duplicate or stale the current message in context.** Incoming messages are stored
  with Discord message IDs. At execution time, `turn.ts` rebuilds bounded recent history,
  excluding only the trigger; this lets a sticky addressed turn see intervening chatter.
  **Chattiness** (`settings`) sets the participation judge's threshold; it is not random.
- **Readable I/O.** Inbound mentions/emoji are resolved to names (`@alice`, `#general`,
  `:smile:`) for both the model and stored history; the model never sees raw `<@id>`. Outbound
  messages never ping (`SAFE_MENTIONS`: no reply ping, no @everyone/@here/role) — the bot
  speaks in plain text and addresses people by name.
- **Per-user memory is automatic and user-controlled.** `contextBlock` surfaces known facts
  every turn. `memoryExtraction.ts` saves only volunteered, non-sensitive durable facts;
  `remember` can save explicit facts. Both honor `!memory off`. A bare `@aigarth`
  (addressed, no text) still gets judged as a real ping.
- **Tools, not prompt:** capabilities are pi `AgentTool`s registered in `buildTools`. A tool
  that produces an image returns its URL in `result.details.images`; `runTurn` forwards each
  to `ctx.onImage` so `index.ts` attaches it to the next reply.
- **Grid key plumbing:** pass `getApiKey: () => config.gridApiKey` to `Agent`; pi-ai resolves
  keys by provider, not off the `Model` object.
- **Sampling:** warmth/anti-repetition params are injected per call via `applySampling`
  (`onPayload`), driven by `config.chat*` — not hardcoded.
- **Memory access goes through `getMemory()`** (lazy, cached). Never `import` the hindsight
  client directly from skills.

## Work Guidance

- New env var → add to `config.ts` + `.env.template` only.
- New tool → `skills/`, then register in `buildTools`; gate it on its config (e.g. vision
  only when `gridVisionModel` is set).

## Verification

- `npm run typecheck` is the gate (no unit tests yet).

## Child DOX Index

- [discord/AGENTS.md](discord/AGENTS.md) — mechanical backstops, scam screen + community votes, commands.
- [skills/AGENTS.md](skills/AGENTS.md) — pi AgentTools the model calls.
- [images/AGENTS.md](images/AGENTS.md) — image model/style/LoRA registry + Horde client.
- [docs/AGENTS.md](docs/AGENTS.md) — agentic markdown doc store (read/grep/index).
- [store/AGENTS.md](store/AGENTS.md) — better-sqlite3 local state.
- [util/AGENTS.md](util/AGENTS.md) — SSRF guard + structured logger.
