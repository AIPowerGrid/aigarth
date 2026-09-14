# src/skills — pi AgentTools the model calls

## Purpose

The agent's capabilities, each exported as a `make*Tool()` factory returning a pi
`AgentTool` (typebox params). The model decides when to call them; `agent.ts`'s `buildTools`
registers them per turn.

## Ownership

- `participation.ts` - `finish_turn` records silent/reply as the sole final text
  decision; `read_channel_history` reads only the current channel. Free text is private.
- `discordActions.ts` — Discord tool factories, backed by per-turn
  callbacks (`DiscordActions`) supplied by `index.ts`: `reply` (the real chat message —
  free text is NOT sent), `reply_in_thread`, `start_ban_poll` / `start_delete_poll`
  (community votes, only enacted by human ✅; registered only when `canModerate`).
  Legacy reply/thread/snooze factories remain unregistered; the
  participant uses finish_turn and cannot mute future model attention. `set_presence`, `set_nickname`
  (guild-only), `create_poll` (native Discord poll), `remind` (persisted; delivered by a timer
  in `index.ts`). `react` lives in `react.ts`. Final silence is explicit finish_turn.
- `generateImage.ts` — `generate_image`: Grid `/v1/images/generations`, driven by the
  `images/` registry; URL returned via `details.images`.
- `remixImage.ts` — `remix_image`: img2img on a source URL, and `remixLast.ts` —
  `remix_last_image`: edit the image aigarth last made in the channel (no URL — uses
  `images/lastImage.ts`, and chains). Both go through `images/edit.ts` (`img2img` on the
  grid `/v1` with FLUX.2 Klein + `image` data-URI + `strength`; the legacy Horde path in
  `images/gridImage.ts` is retired). generate_image + remix record the result as the
  channel's "last image". SSRF-guarded source fetch.
- `docs.ts` — `read_doc` / `grep_docs` / `list_docs` over `docs/store.ts`.
- `crypto.ts` — `crypto_price` / `search_coin` (CoinGecko, structured + cached).
  `cryptoChart.ts` — `crypto_chart` (QuickChart image via `details.images`).
- `gridStatus.ts` - `grid_status`, `validator_status`, `release_info`: fixed public
  `/v1` and official GitHub endpoints, timestamps, source URLs, bounded responses,
  no credentials, no redirects. Include preview releases. Errors mean unknown, not
  zero, and do not establish that the user's credential is invalid.
- `linkPreview.ts` — `fetch_link_preview` (OG preview). `readWebpage.ts` — `read_webpage`
  (full page text). `webSearch.ts` — `web_search` (DuckDuckGo HTML via the SSRF-guarded
  fetch; no API key). All three SSRF-guarded + untrusted-fenced.
- `mood.ts` - legacy mood/chattiness factories, not registered by the participant.
  No numeric participation threshold is applied before the model.
- `vision.ts` — `describe_image`: separate `GRID_VISION_MODEL`; SSRF-guarded, MIME-sniffed.
  Registered only when a vision model is configured.
- `channelStatus.ts` — `set_channel_status` (writes `store/db.ts` channel status).
- `memorySkills.ts` — `remember` / `recall`. `remember` writes **local per-user memory**
  (`store/db.ts` `userMemory`, keyed to the current speaker and surfaced next time) and
  also hindsight if configured; `recall` searches hindsight.
  `remember` must honor per-user memory preference before writing either backend.
- `react.ts` — `react`: emoji-react via the discord-supplied `DiscordActions.react` callback.

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
