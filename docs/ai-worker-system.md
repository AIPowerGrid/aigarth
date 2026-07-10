# AI Power Grid worker system

AI Power Grid routes text, image, and video generation to community-operated GPU
workers. Operators run the model backend; Grid core handles authenticated job
admission, routing, streaming, accounting, and settlement records.

## Worker types

- **Text worker:** `grid-text-worker` connects Ollama, vLLM, SGLang, LM Studio,
  LMDeploy, KoboldCpp, or another OpenAI-compatible backend.
- **Media worker:** `grid-media-worker` connects a local ComfyUI installation and
  executes Grid-resolved image/video workflows.

Both current workers use the persistent `/v1/workers/ws` transport. The retired
Horde poll loop must not be used for new nodes.

## Identity and trust

A worker authenticates with a Grid account key. Its payout attribution belongs
to that account, and the operator selects a Base payout wallet in the developer
console. A worker name is a label, not a wallet proof.

Workers are untrusted compute. Core checks request/result structure, counts text
usage server-side, bounds media parameters, and records signed output commitments
when available. Validators are being built to add unpredictable targeted probes,
reference comparisons, and quorum. The current validator preview is evidence-only.

## Current economics

Completed work earns **den**, an off-chain work measure weighted by useful output
and model policy. The live bootstrap rail distributes an hourly AIPG budget
pro-rata by den through Transfer-verified Base payments. Multi-asset pass-through
and trustless Merkle claims are built or designed in stages but are not the
current payout rail.

Worker bonding is not required today. On-chain bonding, cooldowns, objective
fraud slashing, and dispute rights are future gates and must not be described as
active until deployed and enabled.

## Operator entry points

- Text: `https://github.com/AIPowerGrid/grid-text-worker`
- Media: `https://github.com/AIPowerGrid/grid-media-worker`
- API key: `https://console.aipowergrid.io/dashboard/api-key`
- Public docs: `https://aipowergrid.io/docs`
