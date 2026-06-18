import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { config } from "../config.js";
import {
  catalogForLlm,
  getModelOrDefault,
  getStyleOrDefault,
  MODEL_IDS,
  ALL_STYLE_IDS,
} from "../images/registry.js";

/**
 * `generate_image` — now on the v2 grid's OpenAI-compatible /v1/images endpoint
 * (not the legacy horde async API). system-core dispatches to the comfy worker,
 * the worker uploads to R2, and the endpoint returns a public images.aipg.art
 * URL. The model/style registry still drives model choice + geometry.
 *
 * The image URL rides in details.images so the Discord layer posts it.
 */
export function makeGenerateImageTool(): AgentTool {
  return {
    name: "generate_image",
    label: "Generate Image",
    description:
      "Generate an image on the AI Power Grid and post it to the channel. Use when " +
      "the user asks for a picture/art/render.\n\nModels & styles:\n" +
      catalogForLlm() +
      `\n\nValid model ids: ${MODEL_IDS.map((m) => `"${m}"`).join(", ")}.` +
      `\nValid style ids: ${ALL_STYLE_IDS.join(", ")}.` +
      "\nOmit model/style for sensible defaults.",
    parameters: Type.Object({
      prompt: Type.String({ description: "What to draw. Be vivid and specific." }),
      model: Type.Optional(Type.String({ description: `Model id. One of: ${MODEL_IDS.join(", ")}.` })),
      style: Type.Optional(Type.String({ description: `Style preset. One of: ${ALL_STYLE_IDS.join(", ")}.` })),
      count: Type.Optional(Type.Number({ description: "How many images (1-4, default 1)." })),
    }),
    execute: async (_id, params: any, signal) => {
      const model = getModelOrDefault(params.model);
      const style = getStyleOrDefault(model, params.style);
      const n = Math.max(1, Math.min(Number(params.count ?? 1), 4));
      const size = `${style.width}x${style.height}`;

      const res = await fetch(`${config.gridV1Url.replace(/\/$/, "")}/images/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.gridApiKey}` },
        body: JSON.stringify({
          model: model.id,
          prompt: params.prompt,
          n,
          size,
          response_format: "url",
        }),
        signal,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`image gen failed (HTTP ${res.status}): ${t.slice(0, 200)}`);
      }
      const data = (await res.json()) as any;
      const images = (data?.data ?? [])
        .map((d: any) => d.url)
        .filter((u: any): u is string => typeof u === "string" && u.length > 0);
      if (images.length === 0) throw new Error("no image came back from the grid");

      return {
        content: [
          {
            type: "text",
            text: `Generated ${images.length} image(s) with ${model.id} (${size}). Posting to the channel.`,
          },
        ],
        details: { images, model: model.id, prompt: params.prompt },
      };
    },
  };
}
