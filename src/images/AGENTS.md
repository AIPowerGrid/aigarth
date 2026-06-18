# src/images — image model/style/LoRA registry + Horde client

## Purpose

The data + client behind image generation: which models the grid serves, what each is good
at (for the LLM), the style presets (geometry + sampler), LoRA plumbing, and the Horde
async client used for img2img/remix.

## Ownership

- `registry.ts` — `IMAGE_MODELS` (id MUST match what workers advertise via
  `GET /api/v2/status/models?type=image`), per-model `description` + `styles`, `Lora`/`Style`/
  `ImageModel` types, and helpers: `getModelOrDefault`, `getStyleOrDefault`, `MODEL_IDS`,
  `ALL_STYLE_IDS`, `styleIdsFor`, `catalogForLlm`, `resolveImageParams`.
- `gridImage.ts` — `GridImageClient`: AI Horde async API (submit → poll → hosted URLs,
  r2=true), with LoRA mapping. Used by `remix_image`.

## Local Contracts

- Model `id` is the exact worker-advertised name — adding a model is a registry entry, not
  a code change; styles come for free.
- LoRAs are wired structurally (model-, style-, request-level → Horde `params.loras`) but
  may be unused until workers support them; keep the path intact.
- The Horde client is intentionally separate from the chat `/v1` path; when `/v1/images` is
  canonical it can be swapped without touching skills or registry.
- `generate_image` uses the registry for geometry but posts via `/v1/images` (see skills);
  `gridImage.ts` is the Horde path for remix/img2img.

## Work Guidance

—

## Verification

—

## Child DOX Index

- None — leaf.
