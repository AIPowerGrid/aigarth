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

There's no `!ask` prefix and no rigid trigger words. Every eligible message goes
to a 120B participation judge with real context — where it is, the recent
conversation, and whether the latest message is a mention, reply, DM, or just
overheard. Even direct addressing is evidence rather than an automatic trigger,
and **the model decides what to do**:

- **reply** — join the conversation
- **react** — drop a single emoji
- **reply in thread** — branch a side-conversation
- **stay quiet** — the default when it has nothing to add

Because engagement is the model's call, aigarth behaves like a member of the
channel, not a vending machine.

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
| 🧠 **Memory** | Remembers facts across conversations |
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

Optional — docs Q&A needs the retrieval service running alongside:

```bash
uvicorn retrieval_service:app --host 127.0.0.1 --port 8088
```

## Configuration

| Var | Purpose |
|--|--|
| `DISCORD_TOKEN`, `GRID_API_KEY` | Required |
| `GRID_GATE_MODEL` | Participation judge; defaults to `GRID_CHAT_MODEL` |
| `GRID_VISION_MODEL` | Enables vision when set to a multimodal grid model |
| `HINDSIGHT_URL` | Enables long-term memory (no-op until set) |

Requires **Node 22.19+**.
