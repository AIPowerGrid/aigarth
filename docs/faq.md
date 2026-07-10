# AI Power Grid FAQ

## What does the Grid provide?

One OpenAI-compatible API for community-operated text, image, and video
generation. The public base is `https://api.aipowergrid.io` and current clients
use `/v1` endpoints.

## How do I get an API key?

Sign in at `https://console.aipowergrid.io` with Google, GitHub, or a wallet,
then create a key on the API Keys page. Do not paste keys into public chat.

## How do I run a worker?

Use `grid-text-worker` for LLM backends or `grid-media-worker` for ComfyUI. Both
connect through `/v1/workers/ws`. A bond is not required today.

## How are workers paid?

Core records den for completed work and the live bootstrap sender pays an hourly
AIPG budget pro-rata to configured Base payout wallets. See the public
transparency page for current records. USDC/multi-asset pass-through and Merkle
claims are not the current rail.

## Are validators live?

The validator node and core assignment/scorecard surfaces are in preview.
Evidence is informational: it does not yet pay validators, change routing,
strike workers, or slash stake.

## Is staking active?

Passive staking rewards ended. Existing stakers can withdraw and claim old
earned rewards through the current staking page. New validator staking and
worker bonding are future systems.

## Is the network fully decentralized?

No. Worker supply is distributed, but core coordination is currently operated.
Partner core nodes, validator quorum, disputes, and Base-anchored epochs are
roadmap work.

## Which models are online?

Availability changes as workers connect. Query `/v1/models` and
`/v1/status/models`; do not rely on an old model list.

## Where should security issues go?

Use the `SECURITY.md` disclosure instructions in the affected repository. Do not
post exploit details, credentials, or sensitive evidence in public channels.
