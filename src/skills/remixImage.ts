import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { img2img } from "../images/edit.js";
import { cleanArg } from "./crypto.js";

/**
 * remix_image — img2img on a source image URL (an attachment someone shared, shown
 * in context). Rebuilt on the grid's /v1 endpoint (the legacy Horde path is retired).
 * For editing the image aigarth ITSELF last made, prefer remix_last_image (no URL).
 *
 * @param record called with the result URL so it becomes this channel's "last image".
 */
export function makeRemixImageTool(record: (url: string) => void): AgentTool {
  return {
    name: "remix_image",
    label: "Remix Image (img2img)",
    description:
      "Transform an EXISTING image (given its URL — e.g. an attachment someone shared) " +
      "with a prompt and post the result: 'make this anime', 'add a sunset'. strength " +
      "0.2=subtle … 0.9=big change. To edit the image YOU last generated, use " +
      "remix_last_image instead (no URL needed).",
    parameters: Type.Object({
      image_url: Type.String({ description: "URL of the source image to remix." }),
      prompt: Type.String({ description: "How to transform it, in words." }),
      strength: Type.Optional(Type.Number({ description: "0.2 (subtle) … 0.9 (strong). Default 0.6." })),
    }),
    execute: async (_id, params: any, signal) => {
      const r = await img2img({
        sourceUrl: cleanArg(params.image_url),
        prompt: cleanArg(params.prompt),
        strength: Number(params.strength),
        signal,
      });
      record(r.images[0]);
      return {
        content: [{ type: "text", text: `Remixed it (strength ${r.strength}). Posting.` }],
        details: { images: r.images, model: r.model, strength: r.strength },
      };
    },
  };
}
