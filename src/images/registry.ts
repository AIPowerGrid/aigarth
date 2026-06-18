/**
 * Image model + style + LoRA registry.
 *
 * The shape the user asked for:
 *   - each MODEL has a human/LLM-facing description of what it's good at
 *   - under each model, a handful of STYLES (resolution, steps, cfg, sampler,
 *     optional prompt template) the bot can expose and the LLM can pick
 *   - LoRA support is wired through now (structurally) so we can attach LoRAs
 *     later without touching the call path
 *
 * Model ids MUST match what the grid's image workers advertise
 * (GET /api/v2/status/models?type=image). Today that's `z-image-turbo` and
 * `flux.2 klein 4b fp8`. Add models here as the grid serves them.
 */

/** A LoRA attachment. `model`/`clip` are strengths (0..~1.5). Passed straight
 *  into the Horde `params.loras` array. Not used yet — here so styles/requests
 *  can carry LoRAs the moment the grid's workers support them. */
export interface Lora {
  /** LoRA name or version id as known to the worker / model reference. */
  name: string;
  /** UNet strength (default 1.0). */
  model?: number;
  /** CLIP strength (default 1.0). */
  clip?: number;
  /** Treat `name` as a specific version id rather than a model id. */
  isVersion?: boolean;
}

/** A named preset under a model: geometry + sampler params + optional prompt
 *  shaping. `promptTemplate` uses `{p}` (user prompt) and `{np}` (negative);
 *  `###` separates positive from negative in the Horde prompt convention. */
export interface Style {
  label: string;
  description: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  sampler: string;
  karras?: boolean;
  /** e.g. "{p} . oil painting, thick impasto###{np}". Omit for plain "{p}". */
  promptTemplate?: string;
  /** Style-level LoRAs (merged with model + request LoRAs). */
  loras?: Lora[];
}

export interface ImageModel {
  /** Grid model name exactly as workers advertise it. */
  id: string;
  label: string;
  /** What this model is good at — shown to the LLM so it can choose well. */
  description: string;
  defaultStyle: string;
  styles: Record<string, Style>;
  /** Model-wide LoRAs always applied (none today). */
  loras?: Lora[];
  nsfw?: boolean;
}

// Artistic prompt modifiers reused across models. Keeping the templates here
// (not per-model) means adding a model only needs geometry/step tuning.
const T = {
  // `###` separates positive from negative (Horde convention). Empty negatives
  // leave a trailing `###` which resolveImageParams strips.
  plain: "{p} ### {np}",
  vivid:
    "{p} . ultra-detailed, vivid color, dramatic lighting, sharp focus, high dynamic range###{np}",
  anime:
    "{p} . anime style, clean line art, cel shading, expressive, studio quality###{np}",
  watercolor:
    "{p} . delicate watercolor painting, soft gradients, gentle washes, dreamy###{np}",
  comic:
    "{p} . comic book art, bold ink lines, halftone shading, dynamic composition###{np}",
  photoreal:
    "{p} . photorealistic, 50mm lens, natural lighting, fine texture, lifelike###{np}",
};

/** Build the standard handful of styles for a model at the given step/cfg.
 *  Square/portrait/landscape geometry + a few artistic looks. */
function standardStyles(steps: number, cfg: number, sampler: string): Record<string, Style> {
  const base = { steps, cfgScale: cfg, sampler, karras: false };
  return {
    default: { label: "Default", description: "Balanced square 1:1.", width: 1024, height: 1024, ...base, promptTemplate: T.plain },
    portrait: { label: "Portrait", description: "Tall 2:3 — people, characters.", width: 832, height: 1216, ...base, promptTemplate: T.plain },
    landscape: { label: "Landscape", description: "Wide 3:2 — scenery, banners.", width: 1216, height: 832, ...base, promptTemplate: T.plain },
    vivid: { label: "Vivid", description: "Punchy, high-contrast, detailed.", width: 1024, height: 1024, ...base, promptTemplate: T.vivid },
    anime: { label: "Anime", description: "Clean anime / cel-shaded look.", width: 832, height: 1216, ...base, promptTemplate: T.anime },
    watercolor: { label: "Watercolor", description: "Soft, dreamy painted look.", width: 1024, height: 1024, ...base, promptTemplate: T.watercolor },
    comic: { label: "Comic", description: "Bold comic-book ink + halftone.", width: 1024, height: 1024, ...base, promptTemplate: T.comic },
    photoreal: { label: "Photoreal", description: "Lifelike photographic render.", width: 1216, height: 832, ...base, promptTemplate: T.photoreal },
  };
}

export const IMAGE_MODELS: Record<string, ImageModel> = {
  // NOTE: z-image-turbo is intentionally NOT registered — its workers hang on
  // the grid (jobs stick in "processing" for minutes). Re-add it here only once
  // those workers are fixed. flux.2 klein is the working image model.
  "FLUX.2 Klein 4B FP8": {
    id: "FLUX.2 Klein 4B FP8",
    label: "FLUX.2 Klein",
    description:
      "Higher-quality Flux model. Best for detailed, polished, photoreal or " +
      "illustrative work where quality matters more than speed (slower than " +
      "Turbo). Prefer for hero images, complex scenes, text-in-image.",
    defaultStyle: "default",
    // Full(er) model: more steps, modest cfg.
    styles: standardStyles(24, 3.5, "k_euler"),
  },
};

// flux.2 klein is the model that actually works on the grid right now;
// z-image-turbo workers hang. Name must match what the v2 worker advertises.
export const DEFAULT_MODEL_ID = "FLUX.2 Klein 4B FP8";

export function getModelOrDefault(id?: string): ImageModel {
  if (id && IMAGE_MODELS[id]) return IMAGE_MODELS[id];
  return IMAGE_MODELS[DEFAULT_MODEL_ID];
}

export function getStyleOrDefault(model: ImageModel, styleId?: string): Style {
  if (styleId && model.styles[styleId]) return model.styles[styleId];
  return model.styles[model.defaultStyle];
}

export const MODEL_IDS = Object.keys(IMAGE_MODELS);
export function styleIdsFor(modelId: string): string[] {
  const m = IMAGE_MODELS[modelId];
  return m ? Object.keys(m.styles) : [];
}
/** Union of every style id across models (for the tool's enum). */
export const ALL_STYLE_IDS = Array.from(
  new Set(Object.values(IMAGE_MODELS).flatMap((m) => Object.keys(m.styles))),
);

/** Compact catalog text for the LLM/tool description so the model knows what
 *  to pick and why. */
export function catalogForLlm(): string {
  const lines: string[] = [];
  for (const m of Object.values(IMAGE_MODELS)) {
    lines.push(`• "${m.id}" (${m.label}): ${m.description}`);
    const styles = Object.entries(m.styles)
      .map(([id, s]) => `${id} (${s.width}x${s.height})`)
      .join(", ");
    lines.push(`    styles: ${styles}`);
  }
  return lines.join("\n");
}

/** Final, resolved generation parameters after model+style+overrides+loras. */
export interface ResolvedImageParams {
  modelId: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  sampler: string;
  karras: boolean;
  /** Full positive###negative prompt per Horde convention. */
  prompt: string;
  loras: Lora[];
  nsfw: boolean;
  /** img2img: raw base64 (no data: prefix). When set, this is a remix. */
  sourceImageB64?: string;
  /** 0..1; lower keeps more of the source, higher follows the prompt more. */
  denoisingStrength?: number;
}

export interface ResolveOptions {
  prompt: string;
  modelId?: string;
  styleId?: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  loras?: Lora[];
  nsfw?: boolean;
  sourceImageB64?: string;
  denoisingStrength?: number;
}

function snap64(n: number, min = 512, max = 1536): number {
  return Math.max(min, Math.min(max, Math.round(n / 64) * 64));
}

/** Resolve a request into concrete grid params. Style provides defaults;
 *  explicit overrides win. Merges model + style + request LoRAs. */
export function resolveImageParams(opts: ResolveOptions): ResolvedImageParams {
  const model = getModelOrDefault(opts.modelId);
  const style = getStyleOrDefault(model, opts.styleId);

  const template = style.promptTemplate ?? T.plain;
  const np = opts.negativePrompt?.trim() ? ` ### ${opts.negativePrompt.trim()}` : "";
  // {p} -> prompt, {np} -> negative (already "###..."-shaped in templates, so
  // for templates that embed ### we append the user's negative after it).
  let prompt = template.includes("{np}")
    ? template.replace("{p}", opts.prompt).replace("{np}", opts.negativePrompt?.trim() ?? "")
    : `${opts.prompt}${np}`;
  prompt = prompt.replace(/###\s*$/, "").trim(); // drop empty trailing separator

  const loras = [
    ...(model.loras ?? []),
    ...(style.loras ?? []),
    ...(opts.loras ?? []),
  ];

  return {
    modelId: model.id,
    width: opts.width ? snap64(opts.width) : style.width,
    height: opts.height ? snap64(opts.height) : style.height,
    steps: opts.steps ?? style.steps,
    cfgScale: opts.cfgScale ?? style.cfgScale,
    sampler: style.sampler,
    karras: style.karras ?? false,
    prompt,
    loras,
    nsfw: opts.nsfw ?? model.nsfw ?? false,
    sourceImageB64: opts.sourceImageB64,
    denoisingStrength: opts.denoisingStrength,
  };
}
