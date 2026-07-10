# AI Power Grid project overview

AI Power Grid is an OpenAI-compatible generation network for text, image, and
video. Community operators run GPU workers; developers and applications call one
API instead of self-hosting every model or depending only on a centralized AI
vendor.

## Current products

- `api.aipowergrid.io/v1`: generation and status APIs
- `console.aipowergrid.io`: human authentication, API keys, usage, workers,
  validator preview, rewards, and payout transparency
- `aipg.chat`: chat and agent experience on Grid models
- `aipg.art`: image/video gallery and creation experience
- `grid-text-worker` and `grid-media-worker`: distributable worker runtimes
- `grid-validator`: evidence-only validator preview in active development

## Decentralization

The GPU supply is distributed today. Grid core is still an operated coordinator,
so the system is not fully trustless. The roadmap adds targeted validator
assignments, reference comparisons, quorum/disputes, partner-operated core
nodes, and compact Base commitments. Claims should match that staged reality.

## Base role

AIPG is a fixed-supply ERC-20 on Base. The Grid diamond hosts model, recipe, job
anchor, worker registry, and reward-related modules. Hot inference stays
off-chain; Base is used where public durable registry, commitment, and economic
state add value.

## Economic posture

Worker den and the live custodial AIPG payout rail are active. Demand charging,
multi-asset pass-through, worker bonding, trustless claims, and validator
economics have separate rollout gates. Never collapse built, deployed, and live
into one status.
