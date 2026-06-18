import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { GridImageClient } from "../images/gridImage.js";
import { resolveImageParams } from "../images/registry.js";
import { safeFetchBuffer } from "../util/net.js";

/**
 * remix_image — img2img on FLUX.2 Klein (the img2img-capable model the grid
 * serves). Takes a source image (URL, e.g. an attachment shown in context) +
 * a prompt describing the change, and posts the remixed result.
 *
 * `strength` is the denoising strength: lower = closer to the original, higher
 * = follows the prompt more. SSRF-guarded source fetch + size cap.
 */

const KLEIN = "flux.2 klein 4b fp8";

export function makeRemixImageTool(client: GridImageClient): AgentTool {
  return {
    name: "remix_image",
    label: "Remix Image (img2img)",
    description:
      "Transform an existing image with a prompt (img2img) on FLUX.2 Klein and " +
      "post the result. Use when the user shares an image and wants it changed/" +
      "restyled ('make this anime', 'add a sunset'). Provide the image URL.",
    parameters: Type.Object({
      image_url: Type.String({ description: "URL of the source image to remix." }),
      prompt: Type.String({ description: "How to transform it." }),
      strength: Type.Optional(
        Type.Number({ description: "0.2 (subtle) … 0.9 (strong). Default 0.6." }),
      ),
      style: Type.Optional(Type.String({ description: "Optional style preset id." })),
    }),
    execute: async (_id, params: any, signal) => {
      const got = await safeFetchBuffer(params.image_url, { maxBytes: 8_000_000 });
      if (!got) throw new Error("couldn't fetch that image (blocked, private, or too large)");

      const strength = Math.max(0.1, Math.min(Number(params.strength ?? 0.6), 0.95));
      const resolved = resolveImageParams({
        prompt: params.prompt,
        modelId: KLEIN, // img2img runs on Klein
        styleId: params.style,
        sourceImageB64: got.buf.toString("base64"),
        denoisingStrength: strength,
      });

      const result = await client.generate(resolved, 1, signal);
      return {
        content: [
          {
            type: "text",
            text: `Remixed on ${result.model} (strength ${strength}). Posting it.`,
          },
        ],
        details: { images: result.images, model: result.model, strength },
      };
    },
  };
}
