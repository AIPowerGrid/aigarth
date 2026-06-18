/**
 * Grid image generation client — AI Horde async API.
 *
 * Submit → poll → return hosted image URLs (r2=true). Same host + apikey as the
 * text side. This is intentionally separate from the chat path (which goes
 * through pi-ai → the grid's /v1): image gen on the grid is still the Horde
 * async API. When the grid's /v1/images endpoint is canonical we can swap this
 * one module without touching the skill or registry.
 */

import type { ResolvedImageParams } from "./registry.js";

export interface GridImageResult {
  images: string[]; // hosted URLs
  model?: string;
  seed?: string;
}

export interface GridImageClientOptions {
  apiKey: string;
  baseUrl?: string; // default https://api.aipowergrid.io
  clientAgent?: string;
  maxWaitMs?: number;
  pollIntervalMs?: number;
}

interface HordeLora {
  name: string;
  model: number;
  clip: number;
  is_version?: boolean;
}

export class GridImageClient {
  private apiKey: string;
  private base: string;
  private agent: string;
  private maxWaitMs: number;
  private pollMs: number;

  constructor(opts: GridImageClientOptions) {
    this.apiKey = opts.apiKey;
    this.base = (opts.baseUrl ?? "https://api.aipowergrid.io").replace(/\/$/, "");
    this.agent = opts.clientAgent ?? "AigarthAgent:1.0";
    this.maxWaitMs = opts.maxWaitMs ?? 180_000;
    this.pollMs = opts.pollIntervalMs ?? 4_000;
  }

  async generate(p: ResolvedImageParams, n = 1, signal?: AbortSignal): Promise<GridImageResult> {
    if (!this.apiKey) throw new Error("Grid API key not configured");

    const loras: HordeLora[] | undefined =
      p.loras.length > 0
        ? p.loras.map((l) => ({
            name: l.name,
            model: l.model ?? 1.0,
            clip: l.clip ?? 1.0,
            ...(l.isVersion ? { is_version: true } : {}),
          }))
        : undefined;

    const isImg2img = !!p.sourceImageB64;
    const body: Record<string, any> = {
      prompt: p.prompt,
      params: {
        sampler_name: p.sampler,
        cfg_scale: p.cfgScale,
        width: p.width,
        height: p.height,
        steps: p.steps,
        karras: p.karras,
        n: Math.max(1, Math.min(n, 4)),
        ...(loras ? { loras } : {}),
        ...(isImg2img ? { denoising_strength: p.denoisingStrength ?? 0.6 } : {}),
      },
      nsfw: p.nsfw,
      censor_nsfw: !p.nsfw,
      models: [p.modelId],
      r2: true,
      trusted_workers: false,
      // img2img: send the source + tell the grid how to process it.
      ...(isImg2img ? { source_image: p.sourceImageB64, source_processing: "img2img" } : {}),
    };

    const submit = await fetch(`${this.base}/api/v2/generate/async`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: this.apiKey,
        "Client-Agent": this.agent,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (submit.status !== 200 && submit.status !== 202) {
      const text = await submit.text().catch(() => "");
      throw new Error(`grid image submit failed (${submit.status}): ${text.slice(0, 300)}`);
    }
    const { id } = (await submit.json()) as { id?: string };
    if (!id) throw new Error("grid image submit returned no id");

    return this.poll(id, p.modelId, signal);
  }

  private async poll(id: string, modelId: string, signal?: AbortSignal): Promise<GridImageResult> {
    const deadline = Date.now() + this.maxWaitMs;
    let first = true;
    while (Date.now() < deadline) {
      if (!first) await sleep(this.pollMs, signal);
      first = false;

      const res = await fetch(`${this.base}/api/v2/generate/status/${id}`, {
        headers: { apikey: this.apiKey, "Client-Agent": this.agent },
        signal,
      });
      const data = (await res.json()) as {
        done?: boolean;
        faulted?: boolean;
        generations?: Array<{ img?: string; seed?: string; model?: string }>;
      };
      if (data.faulted) throw new Error("generation faulted on the grid");
      if (data.done) {
        const gens = data.generations ?? [];
        // The raw `img` is a presigned R2 URL that doesn't authorize externally
        // (the gallery hits the same issue). Convert to the public CDN form —
        // images.aipg.art/<filename> — exactly like the gallery's ConvertToCDNURL.
        const images = gens.map((g) => toCdnUrl(g.img)).filter((x): x is string => !!x);
        if (images.length === 0) throw new Error("no image was generated");
        return { images, model: gens[0]?.model ?? modelId, seed: gens[0]?.seed };
      }
    }
    throw new Error(`image generation timed out after ${Math.round(this.maxWaitMs / 1000)}s`);
  }
}

/** Convert a raw R2/presigned URL to the public CDN URL the gallery uses:
 *  https://images.aipg.art/<filename>. Filename = last path segment (the gen id
 *  .webp). Leaves non-R2 URLs (e.g. QuickChart) untouched. */
function toCdnUrl(img: string | undefined): string | undefined {
  if (!img) return undefined;
  if (img.startsWith("https://images.aipg.art/")) return img;
  if (!/r2\.cloudflarestorage\.com|\.r2\.dev/.test(img)) return img; // not an R2 url (chart etc)
  try {
    const file = new URL(img).pathname.split("/").filter(Boolean).pop();
    return file ? `https://images.aipg.art/${file}` : img;
  } catch {
    return img;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    }, { once: true });
  });
}
