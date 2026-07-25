# src — application code (TypeScript, ESM)

## Purpose

The agent itself: the Discord ingestion + control loop, the Grid-backed tool-calling agent,
typed config, and the subsystems (skills, image registry, doc store, sqlite state, utils).

## Ownership

- `index.ts` — Discord client + `MessageCreate`/reaction handlers. **Conversation coalescing:
  ONE attention per channel.** Per-message ingestion (store history w/ mentions resolved →
  `!`commands → eligibility → compute signals) feeds `noteActivity`; a short
  settle timer (`CONV_SETTLE_MS`, shorter when addressed) then runs **one** `runChannelTurn`
  per channel (serialized; re-runs if activity arrived during it), responding to the channel's
  *current* state — so it structurally cannot post turns out of order. `runChannelTurn`
  fetches live Discord context, then checks the **participation judge** (`discord/gate.ts`,
  the configured capable Grid model → respond/react/moderate/ignore) for the marked focus.
  @-mention/reply/DM/name use are strong context but never bypass judgment. On `respond`, a
  simple grounded reply may come directly from the judge; nuanced/tool work builds the
  per-turn **Discord surface** (`react`/`reply_in_thread`/polls/`snooze`/presence/nickname/
  `create_poll`/`remind`) and calls `runTurn` (hard-timeout-aborted via `TURN_TIMEOUT_MS`).
  The room is fetched and judged again before posting if it changed during a slow turn.
  `moderate` runs a silent full-agent review with only ban/delete poll tools exposed.
  Recent user activities are retained in memory for two minutes so a `MessageDelete` can
  requeue the exact focus for model review; ordinary chatter cannot bury that review.
  Reminder delivery + housekeeping timers + reaction vote tallying also live here.
- `agent.ts` — `runTurn`: builds the persona prompt + per-turn context (who/where/history +
  how the message relates to the bot), constructs the pi `Agent`, registers tools (Discord
  actions + skills), applies human-sounding sampling (`onPayload`), collects bounded tool
  evidence, and sends the draft through `replyEditor.ts`.
- `replyEditor.ts` — fail-closed final grounding pass for full-agent replies. It verifies the
  draft against the current transcript and tool evidence, removes invented or contradicted
  claims, and emits only the exact final reply.
- `grid.ts` — the Grid as a `pi-ai` `Model<"openai-completions">` (custom `baseUrl`).
- `config.ts` — the ONE typed env surface (`config`, `isAdmin`); defaults + `.env.template`.
- `memory.ts` — long-term memory behind a `MemoryStore` interface; hindsight when configured,
  else a no-op (`NullMemory`). One swappable file.
- `conversationSummary.ts` — folds messages older than the verbatim window into a
  persisted channel summary using `GRID_SUMMARY_MODEL`; one refresh per channel.
- `memoryExtraction.ts` — strict-JSON, privacy-conservative extraction of up to two
  user-volunteered durable facts after successful interactions; honors per-user opt-out.
- `contextEval.ts` — live Grid eval for summary continuity and memory privacy behavior.
- `conversationEval.ts` — live, multi-message behavioral simulation for speak/silence and
  final visible replies. `discordContextEval.ts` is the read-only real-Discord context check.
- `moderationEval.ts` — live model/tool test for clear scams and benign lookalikes in
  silent moderation-review mode.
- `discord/`, `skills/`, `images/`, `docs/`, `store/`, `util/` — subsystems, each owned in
  its own AGENTS.md.
- `smoke.ts` — build-and-run smoke check (`npm run smoke`).

## Local Contracts

- **Persona vs context split:** `personaPrompt()` is stable system text (who you are + how
  acting = calling tools); per-turn channel / history / message / **how it relates to the
  bot** go in `contextBlock()`. Keep them separate (audit fix for robotic replies).
- **Speaking is deliberate and grounded.** The judge may emit a short plain reply only when
  the visible room already contains everything needed. Nuanced or external work runs the
  full tool-capable agent and then `replyEditor.ts`; `turn.ts` posts its final text. Reactions,
  threads, moderation, and other Discord side effects remain tools supplied by `index.ts`.
  An empty or ungrounded final edit means deliberate silence.
- **Moderation is model-judged and mechanically bounded.** There is no keyword/domain
  classifier. The gate may choose `moderate` from full context; `runTurn` then exposes only
  `start_ban_poll` and `start_delete_poll`, suppresses all text, and permits no direct ban.
  Evidence snapshots, human quorum, deduplication, and enforcement remain deterministic.
- **Addressed messages bypass the per-user cooldown, not participation judgment.** A mention /
  reply-to-bot (even with the ping off — detected via the fetched referenced message) / DM is
  considered promptly, then the AI may still ignore it. The reply ceiling applies to everyone.
- **Use the live room, not an ingest snapshot.** Incoming messages are stored with Discord
  IDs, but at execution time `discord/context.ts` fetches the current visible window and
  synchronizes it by stable ID. `[FOCUS]` marks the message under consideration and `[NOW]`
  marks the visible end, so a still-open direct question can survive unrelated chatter while
  a withdrawn, answered, corrected, or obsolete request is ignored. If the room changes
  during a slow full-agent turn, `turn.ts` re-fetches and re-judges before posting.
  **Chattiness** (`settings`) sets the judge's threshold; it is not random.
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

- `npm run typecheck`, `npm test`, and `npm run build` are deterministic release gates.
- `npm run eval` covers labeled engagement decisions on the live Grid.
- `npm run eval:conversation` covers the selected response engine and final visible reply.
- `npm run eval:discord-context` proves the production Discord fetch/metadata/sync path
  without posting. `npm run eval:context` covers summary continuity and memory privacy.

## Child DOX Index

- [discord/AGENTS.md](discord/AGENTS.md) — AI moderation routing, mechanical vote backstops, commands.
- [skills/AGENTS.md](skills/AGENTS.md) — pi AgentTools the model calls.
- [images/AGENTS.md](images/AGENTS.md) — image model/style/LoRA registry + Horde client.
- [docs/AGENTS.md](docs/AGENTS.md) — agentic markdown doc store (read/grep/index).
- [store/AGENTS.md](store/AGENTS.md) — better-sqlite3 local state.
- [util/AGENTS.md](util/AGENTS.md) — SSRF guard + structured logger.
