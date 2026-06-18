# aigarth-agent

The revamped **aigarth** — AI Power Grid's community Discord agent, rebuilt on the
[**pi** agent core](https://github.com/badlogic/pi-mono) and running entirely on
**the Grid's own `/v1`** (dogfooding: a real tool-calling agent served by AIPG
workers, not a corporate cloud).

## Why this exists

The old `aigarth-chatbot` (Python) hit the legacy Horde text endpoint with a
hand-built mega-prompt and parsed JSON out of the reply — no real tool calling,
fake "tools" stuffed into the prompt, and it didn't use AIPG's own modern stack.

This version:
- **Brain = pi-agent-core** with a real tool-calling loop.
- **Model = the Grid** via `pi-ai`'s OpenAI-compatible `baseUrl` → `api.aipowergrid.io/v1`.
- **Capabilities = skills** (not MCP): the model decides when to call them.

## Architecture

```
Discord ──► aigarth-agent (TS, pi)
               ├─ model: Grid /v1  (pi-ai openai-completions, custom baseUrl)
               └─ skills:
                   ├─ generate_image  ─► Grid Horde async API (image workers)
                   └─ search_docs     ─► retrieval_service.py (Python, ChromaDB)
```

The RAG/embeddings stack stays in Python (`aigarth-chatbot/retrieval_service.py`)
so we don't reimplement ChromaDB in JS — the TS skill just calls it over HTTP.

## Image generation

`src/images/registry.ts` is the model + style + LoRA registry the user asked for:

- **Each model** (`z-image-turbo`, `flux.2 klein 4b fp8`) has a description of
  what it's good at — surfaced to the LLM so it picks well.
- **Each model exposes a handful of styles** (resolution, steps, cfg, sampler,
  optional prompt template): `default`, `portrait`, `landscape`, `vivid`,
  `anime`, `watercolor`, `comic`, `photoreal`.
- **LoRA support is wired through** (`Lora` type → Horde `params.loras`) so LoRAs
  work the moment the grid's workers support them — model-, style-, or
  request-level.

Add a model: add an entry to `IMAGE_MODELS` with the exact id workers advertise
(`GET /api/v2/status/models?type=image`) and step/cfg tuning. Styles come for free.

## Run

```bash
# 1. retrieval service (Python, in ../aigarth-chatbot)
pip install fastapi uvicorn
uvicorn retrieval_service:app --host 127.0.0.1 --port 8088

# 2. the agent
cp .env.template .env   # fill in DISCORD_TOKEN + GRID_API_KEY
npm install
npm run build
npm start
```

## Skills (the model calls these)

| Skill | What | Notes vs old aigarth |
|-------|------|----------------------|
| `generate_image` | Image gen on the Grid | model/style/LoRA registry |
| `remix_image` | img2img on FLUX.2 Klein | source-image + strength; SSRF-guarded fetch |
| `grid_status` | Live grid stats | worker counts, queue, models online — dogfooding showcase |
| `search_docs` | RAG over the knowledge base | model decides *when* (not stuffed every prompt) |
| `crypto_price` / `search_coin` | CoinGecko | structured output, cached, no regex intent-router |
| `crypto_chart` | Price chart image | QuickChart (no native deps); image posted to channel |
| `describe_image` | Vision | **separate** `GRID_VISION_MODEL`; SSRF-guarded, MIME-sniffed |
| `fetch_link_preview` | OG preview of a shared URL | **SSRF-guarded**, untrusted-fenced |
| `set_channel_status` | Record channel summary | real tool, not a JSON side-channel |
| `remember` / `recall` | Long-term memory | **hindsight** (semantic), not full-dump K/V |

## Discord layer (deterministic, off the LLM path)

- **Two-tier gating** (`discord/gating.ts`): **addressed** (mention/name/reply-to-bot/DM) → always run; **proactive** (unaddressed) → a *free* chattiness-weighted gate decides whether to even wake the LLM (so chattiness is meaningful again without an LLM call per message); else **skip**. Per-user cooldown + per-channel proactive cooldown.
- **Decide-to-respond + emoji**: on any run the agent can **reply**, **`react`** with a single emoji (the `react` skill), or **stay silent** (no text, no react) — restoring the old behavior, now driven by real tool-calling instead of JSON-in-text.
- **Scam moderation** (`discord/scam.ts`): deterministic, **fail-closed** screen (untrusted invites / wallet-drainer phrasing + link), registered-host allowlist (no substring "trust"), **persisted** ban votes via raw reaction events, default outcome a reversible **timeout**, no bot self-vote.
- **Commands** (`discord/commands.ts`): `!help`, admin `!chattiness` / `!remember` / `!upload` / `!list` / `!delete`.
- **State** (`store/db.ts`): better-sqlite3 (WAL, epoch-ms, id-ordering, size budgets) for history, channel status, settings, ban votes.

## Audit outcome (ported with improvements)

**Kept+improved:** image gen, doc RAG, channel-status awareness, message history, teach-a-fact, scam moderation, crypto, link previews.
**Replaced:** legacy Horde text endpoint + mega-prompt JSON-munging → Grid `/v1` + real tool calling; full-dump memory → hindsight; blocking `requests` → async; per-message LLM "should I respond" → cheap gating.
**Dropped:** `mood`, `recent_happenings` (dead code), reaction-to-previous-message guessing, the SSRF-prone `ingest_from_url` path.
**Security fixes:** SSRF guard on all server-side URL fetches, fail-closed scam screen, proper host parsing, persisted votes, rate limiting.

## Not done yet
- **No live run** — needs `DISCORD_TOKEN` + `GRID_API_KEY`.
- **hindsight** is wired but optional; stand up the server (Docker) + set `HINDSIGHT_URL` to enable long-term memory (no-op until then).
- **Vision** needs a multimodal model — set `GRID_VISION_MODEL` to one the grid serves (skill auto-enables when set).
- Runtime needs **Node 20+** for the native better-sqlite3 build in production (dev verified on 18 via prebuilds).
