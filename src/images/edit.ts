import { config } from "../config.js";
import { safeFetchBuffer } from "../util/net.js";

/**
 * img2img on the grid's OpenAI-compatible /v1 endpoint (same one generate_image
 * uses). The grid does img2img via an `image` data-URI + `strength` on FLUX.2 Klein
 * (Krea 2 Turbo can't take an input image). Source fetch is SSRF-guarded + size-capped.
 */
const IMG2IMG_MODEL = "FLUX.2 Klein 4B FP8";

export interface Img2ImgResult {
  images: string[];
  model: string;
  strength: number;
}

export async function img2img(opts: {
  sourceUrl: string;
  prompt: string;
  strength?: number;
  size?: string;
  signal?: AbortSignal;
}): Promise<Img2ImgResult> {
  const got = await safeFetchBuffer(opts.sourceUrl, { maxBytes: 8_000_000 });
  if (!got) throw new Error("couldn't fetch the source image (blocked, private, or too large)");

  const strength = Math.max(0.2, Math.min(Number(opts.strength) || 0.6, 0.9));
  const dataUri = `data:${got.contentType || "image/webp"};base64,${got.buf.toString("base64")}`;

  const res = await fetch(`${config.gridV1Url.replace(/\/$/, "")}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.gridApiKey}` },
    body: JSON.stringify({
      model: IMG2IMG_MODEL,
      prompt: opts.prompt,
      n: 1,
      size: opts.size ?? "1024x1024",
      image: dataUri,
      strength,
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`img2img failed (HTTP ${res.status}): ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as any;
  const images = (data?.data ?? [])
    .map((d: any) => d.url)
    .filter((u: any): u is string => typeof u === "string" && u.length > 0);
  if (images.length === 0) throw new Error("no image came back from img2img");
  return { images, model: IMG2IMG_MODEL, strength };
}
