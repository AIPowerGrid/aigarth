import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { config } from "../config.js";
import {
  catalogForLlm,
  getModelOrDefault,
  getStyleOrDefault,
  MODEL_IDS,
  ALL_STYLE_IDS,
  ORIENTATIONS,
  ORIENTATION_IDS,
} from "../images/registry.js";

/**
 * `generate_image` — now on the v2 grid's OpenAI-compatible /v1/images endpoint
 * (not the legacy horde async API). system-core dispatches to the comfy worker,
 * the worker uploads to R2, and the endpoint returns a public images.aipg.art
 * URL. The model/style registry still drives model choice + geometry.
 *
 * The image URL rides in details.images so the Discord layer posts it.
 */
/** @param record called with the result URL so it becomes this channel's "last
 *  image" (editable via remix_last_image). */
export function makeGenerateImageTool(record: (url: string) => void): AgentTool {
  return {
    name: "generate_image",
    label: "Generate Image",
    description:
      "Generate an image on the AI Power Grid and post it to the channel. Use when " +
      "the user asks for a picture/art/render.\n\nModels & styles:\n" +
      catalogForLlm() +
      `\n\nValid model ids: ${MODEL_IDS.map((m) => `"${m}"`).join(", ")}.` +
      `\nValid style ids: ${ALL_STYLE_IDS.join(", ")}.` +
      `\nOrientation (aspect): ${ORIENTATION_IDS.join(", ")} — portrait=tall, landscape=wide, square=1:1.` +
      "\nOmit model/style/orientation for sensible defaults (square).",
    parameters: Type.Object({
      prompt: Type.String({ description: "What to draw. Be vivid and specific." }),
      model: Type.Optional(Type.String({ description: `Model id. One of: ${MODEL_IDS.join(", ")}.` })),
      style: Type.Optional(Type.String({ description: `Style preset. One of: ${ALL_STYLE_IDS.join(", ")}.` })),
      orientation: Type.Optional(
        Type.String({ description: `Aspect ratio. One of: ${ORIENTATION_IDS.join(", ")}. Use portrait for people/characters, landscape for scenery/banners.` }),
      ),
      count: Type.Optional(Type.Number({ description: "How many images (1-4, default 1)." })),
    }),
    execute: async (_id, params: any, signal) => {
      const model = getModelOrDefault(params.model);
      const style = getStyleOrDefault(model, params.style);
      const n = Math.max(1, Math.min(Number(params.count ?? 1), 4));
      // Orientation, when given, is a first-class aspect choice that overrides the
      // style's geometry (so "vivid + landscape" works, not just "landscape style").
      const orient = params.orientation ? ORIENTATIONS[String(params.orientation).toLowerCase()] : undefined;
      const width = orient ? orient.width : style.width;
      const height = orient ? orient.height : style.height;
      const size = `${width}x${height}`;

      const res = await fetch(`${config.gridV1Url.replace(/\/$/, "")}/images/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.gridApiKey}` },
        body: JSON.stringify({
          model: model.id,
          prompt: params.prompt,
          n,
          size,
          // The grid honors these extensions; they make the per-model tuning real
          // (e.g. Krea 2 Turbo's 8 steps → faster gens) instead of worker defaults.
          steps: style.steps,
          cfg_scale: style.cfgScale,
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
      record(images[0]); // remember it so "edit the last image" works

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
