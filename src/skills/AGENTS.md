# src/skills — pi AgentTools the model calls

## Purpose

The agent's capabilities, each exported as a `make*Tool()` factory returning a pi
`AgentTool` (typebox params). The model decides when to call them; `agent.ts`'s `buildTools`
registers them per turn.

## Ownership

- `generateImage.ts` — `generate_image`: Grid `/v1/images/generations`, driven by the
  `images/` registry; URL returned via `details.images`.
- `remixImage.ts` — `remix_image`: img2img on the Horde client (`images/gridImage.ts`);
  SSRF-guarded source fetch.
- `docs.ts` — `read_doc` / `grep_docs` / `list_docs` over `docs/store.ts`.
- `crypto.ts` — `crypto_price` / `search_coin` (CoinGecko, structured + cached).
  `cryptoChart.ts` — `crypto_chart` (QuickChart image via `details.images`).
- `gridStatus.ts` — `grid_status`: live worker/queue/model stats (horde status host).
- `linkPreview.ts` — `fetch_link_preview` (OG preview). `readWebpage.ts` — `read_webpage`
  (full page text). Both SSRF-guarded + untrusted-fenced.
- `vision.ts` — `describe_image`: separate `GRID_VISION_MODEL`; SSRF-guarded, MIME-sniffed.
  Registered only when a vision model is configured.
- `channelStatus.ts` — `set_channel_status` (writes `store/db.ts` channel status).
- `memorySkills.ts` — `remember` / `recall` over `getMemory()` (hindsight).
- `react.ts` — `react`: emoji-react via the discord-supplied `onReact` callback; registered
  only when the turn provides one.

## Local Contracts

- A skill is a pure tool factory: define `name`, `label`, `description`, typebox `parameters`,
  and `execute`. To surface an image to Discord, return it under `result.details.images`.
- Server-side URL fetches MUST use `util/net.ts` (SSRF guard); never `fetch` a user URL raw.
- Tool descriptions are the model's only spec — keep them accurate; valid ids/styles come
  from the `images/` registry, not hardcoded duplicates.
- Skills must not read `process.env` — use `config.ts`.

## Work Guidance

—

## Verification

—

## Child DOX Index

- None — leaf.
