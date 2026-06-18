# src — application code (TypeScript, ESM)

## Purpose

The agent itself: the Discord ingestion + control loop, the Grid-backed tool-calling agent,
typed config, and the subsystems (skills, image registry, doc store, sqlite state, utils).

## Ownership

- `index.ts` — Discord client + `MessageCreate`/reaction handlers; orchestrates gating →
  scam screen → proactive gate → `runTurn`, then posts text/attachments. Housekeeping timers.
- `agent.ts` — `runTurn`: builds the persona prompt + per-turn context, constructs the pi
  `Agent`, registers tools, applies human-sounding sampling (`onPayload`), streams the reply.
- `grid.ts` — the Grid as a `pi-ai` `Model<"openai-completions">` (custom `baseUrl`).
- `config.ts` — the ONE typed env surface (`config`, `isAdmin`); defaults + `.env.template`.
- `memory.ts` — long-term memory behind a `MemoryStore` interface; hindsight when configured,
  else a no-op (`NullMemory`). One swappable file.
- `discord/`, `skills/`, `images/`, `docs/`, `store/`, `util/` — subsystems, each owned in
  its own AGENTS.md.
- `smoke.ts` — build-and-run smoke check (`npm run smoke`).

## Local Contracts

- **Persona vs context split:** `personaPrompt()` is stable system text; per-turn channel /
  history / message go in `contextBlock()`. Keep them separate (audit fix for robotic replies).
- **Tools, not prompt:** capabilities are pi `AgentTool`s registered in `buildTools`. A tool
  that produces an image returns its URL in `result.details.images` so `index.ts` posts it.
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

- [discord/AGENTS.md](discord/AGENTS.md) — deterministic ingestion: gating, proactive gate, scam, commands.
- [skills/AGENTS.md](skills/AGENTS.md) — pi AgentTools the model calls.
- [images/AGENTS.md](images/AGENTS.md) — image model/style/LoRA registry + Horde client.
- [docs/AGENTS.md](docs/AGENTS.md) — agentic markdown doc store (read/grep/index).
- [store/AGENTS.md](store/AGENTS.md) — better-sqlite3 local state.
- [util/AGENTS.md](util/AGENTS.md) — SSRF guard + structured logger.
