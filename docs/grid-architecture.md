# AI Power Grid architecture

## Current serving path

`https://api.aipowergrid.io` is the canonical Grid endpoint. The live public
generation surface is `/v1`:

- `POST /v1/chat/completions` for OpenAI-compatible text
- `POST /v1/responses` for OpenAI Responses-compatible text
- `POST /v1/messages` for Anthropic-compatible text
- `POST /v1/images/generations` for images
- `POST /v1/videos/generations` for video
- `GET /v1/models` and `GET /v1/status/models` for current availability

The old Horde `/api/v2` submit/poll queue is retired for new integrations. The
legacy Flask code remains in `grid-core` for compatibility and migration history,
but it is not the architecture new clients or workers should target.

## Runtime flow

1. A user authenticates with a Grid API key and submits a `/v1` request.
2. Grid core validates the request, applies policy and billing posture, and puts
   a job on the queue.
3. A compatible worker receives the job through `/v1/workers/ws`.
4. Text streams back through the core; media workers upload to presigned storage
   slots and return bounded result metadata.
5. Core records the terminal job and worker den in its durable ledger.
6. The live bootstrap payout process pays attributed worker accounts on Base.

## Decentralization posture

Workers are decentralized today; the coordinator is still an operated service.
The validator preview adds signed, assignment-bound evidence and scorecards but
has no reward, routing, strike, or slashing authority. Multi-core trusted partner
nodes, quorum, disputes, and Base-anchored epoch commitments are future stages.

Hot inference stays off-chain. Base is for durable public state such as the AIPG
token, Grid registry modules, job/reward commitments, and future stake/bonds.

## Authentication

Humans sign in to `https://console.aipowergrid.io` with Google, GitHub, or a
wallet and create API keys. Workers authenticate with an account key. Do not use
old Horde keys or anonymous shared keys for new integrations.
