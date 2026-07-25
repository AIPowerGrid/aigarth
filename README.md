# aigarth

**AI Power Grid's community agent** — an AI that actually hangs out in the
community: it reads the room, decides on its own when to chime in, and *does*
things (makes images, pulls live grid stats, answers from the docs) instead of
sitting behind a command prefix.

And it runs on the Grid itself. aigarth's brain is served by
`api.aipowergrid.io/v1` — the same decentralized network of GPU workers anyone
can plug into. No corporate cloud in the loop: the network is dogfooding its own
inference.

## A participant, not a command bot

There's no `!ask` prefix and no rigid trigger words. Every eligible focus goes
to a 120B participation judge with the current Discord room — including newer
messages, other bots, replies, attachments, reactions, and the channel topic.
The transcript explicitly marks what drew Aigarth's attention and what is
currently at the end of the room. Even direct addressing is evidence rather
than an automatic trigger, and **the model decides what to do**:

- **reply** — join the conversation
- **react** — drop a single emoji
- **reply in thread** — branch a side-conversation
- **stay quiet** — the default when it has nothing to add

Simple presence and room-grounded answers are composed in that decision pass.
Questions needing tools or careful synthesis use the full agent, then a second
grounding pass checks the draft against visible chat and tool evidence before it
can post. If the room changes while that work is running, Aigarth looks again
and drops or requeues a stale answer. Because engagement is the model's call,
aigarth behaves like a member of the channel, not a vending machine.

## What it can do

Every capability is a real tool the model chooses to call:

| | |
|--|--|
| 🎨 **Images** | Generate & remix images on the Grid — model, style, resolution, LoRAs |
| 📊 **Live grid status** | Real worker counts, queue depth, models online |
| 📚 **Docs Q&A** | Retrieval over the AIPG knowledge base, when the question calls for it |
| 💸 **Crypto** | Prices, coin search, and price charts |
| 👁 **Vision** | Describe an image someone drops in |
| 🔗 **Link previews** | Unfurl a shared URL |
| 🧠 **Memory** | Live visible Discord context, rolling channel summaries, and user-controlled durable facts |
| 🛡 **Moderation** | Flags scams; bans/deletes enact only on community ✅ votes — never the bot alone |

## Built on

- **[pi agent core](https://github.com/badlogic/pi-mono)** (TypeScript) — a real
  tool-calling loop.
- **The Grid** for inference — OpenAI-compatible `/v1` via a custom `baseUrl`.
- **better-sqlite3** for local state; optional **hindsight** for semantic
  long-term memory.

## Quickstart

```bash
cp .env.template .env        # set DISCORD_TOKEN + GRID_API_KEY
npm install && npm run build && npm start
```

Use a bounded Core service key for `GRID_API_KEY`, not a personal user key. The
service account must have a positive per-request ceiling and daily spending
ceiling so Aigarth is exempt from promotional request quota without becoming an
unbounded credential.

Optional — docs Q&A needs the retrieval service running alongside:

```bash
uvicorn retrieval_service:app --host 127.0.0.1 --port 8088
```

## Configuration

| Var | Purpose |
|--|--|
| `DISCORD_TOKEN`, `GRID_API_KEY` | Required |
| `GRID_GATE_MODEL` | Participation judge; defaults to `GRID_CHAT_MODEL` |
| `GRID_SUMMARY_MODEL` | Rolling summaries; defaults to the capable chat/judge model |
| `GRID_VISION_MODEL` | Enables vision when set to a multimodal grid model |
| `DISCORD_CONTEXT_LIMIT` | Current visible messages fetched before each decision; default `50`, max `100` |
| `HINDSIGHT_URL` | Enables long-term memory (no-op until set) |

Personal fact memory is inspectable and reversible in Discord: `!memory`,
`!memory on|off`, and `!forget <phrase|all>`. Turning it off clears personal
facts; ordinary channel transcripts continue to follow their retention policy.

## Behavioral verification

```bash
npm run typecheck
npm test
npm run eval                  # labeled speak / react / silence decisions
npm run eval:conversation     # multi-message decisions + visible replies
npm run eval:context          # summaries and private-memory rejection
npm run eval:discord-context  # read-only real Discord fetch; never posts
```

The live evaluations use the configured Grid model. The Discord context check
logs counts and metadata coverage only; it does not print channel content or
send a test message.

Requires **Node 22.19+**.
