# src — application code (TypeScript, ESM)

## Purpose

The agent itself: the Discord ingestion + control loop, the Grid-backed tool-calling agent,
typed config, and the subsystems (skills, image registry, doc store, sqlite state, utils).

## Ownership

- `index.ts` — Discord client + `MessageCreate`/reaction handlers. Per message: store
  history (mentions resolved to readable names via `renderMentions`) → `!`commands → scam
  screen → mechanical eligibility (channel/cooldown/ceiling) → **burst-debounce** (coalesce a
  multi-message thought) → build the per-turn **Discord surface** (`reply`/`react`/
  `reply_in_thread`/poll callbacks that post, attach images, persist) → `runTurn`. Turns run
  independently (NOT serialized per channel — a slow turn must never block the room); `runTurn`
  is hard-timeout-aborted (`TURN_TIMEOUT_MS`) so a stalled grid call can't hang. No content
  gating — the model decides whether/how to engage. Housekeeping timers + reaction vote tallying.
- `agent.ts` — `runTurn`: builds the persona prompt + per-turn context (who/where/history +
  how the message relates to the bot), constructs the pi `Agent`, registers tools (Discord
  actions + skills), applies human-sounding sampling (`onPayload`). Returns `finalText` only
  as an addressed-only safety net — real output goes out via the `reply` tool's side effect.
- `grid.ts` — the Grid as a `pi-ai` `Model<"openai-completions">` (custom `baseUrl`).
- `config.ts` — the ONE typed env surface (`config`, `isAdmin`); defaults + `.env.template`.
- `memory.ts` — long-term memory behind a `MemoryStore` interface; hindsight when configured,
  else a no-op (`NullMemory`). One swappable file.
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
- **Addressed messages bypass the per-user cooldown.** A mention / reply-to-bot (even with
  the ping off — detected via the fetched referenced message) / DM must never be dropped for
  a fast follow-up. The per-channel reply ceiling still applies to everyone (loop safety).
- **Don't duplicate the current message in context.** `index.ts` snapshots history BEFORE
  storing the incoming message and passes it as `ctx.history`; the message appears once, as
  the "Latest —" line. **Chattiness** (`settings`) is shown in context to bias the model's
  unaddressed chime-in decision — it is not a regex gate.
- **Readable I/O.** Inbound mentions/emoji are resolved to names (`@alice`, `#general`,
  `:smile:`) for both the model and stored history; the model never sees raw `<@id>`. Outbound
  messages never ping (`SAFE_MENTIONS`: no reply ping, no @everyone/@here/role) — the bot
  speaks in plain text and addresses people by name.
- **Per-user memory is automatic.** `contextBlock` surfaces `userMemory.list(userId)` (what we
  know about the speaker) every turn; the `remember` tool writes there (keyed to the current
  user), so memory works with no external service. A bare `@aigarth` (addressed, no text) still
  gets a turn — it's a real ping, not noise.
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
