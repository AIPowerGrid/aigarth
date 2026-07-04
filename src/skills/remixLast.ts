import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { img2img } from "../images/edit.js";
import { getLastImage, setLastImage } from "../images/lastImage.js";
import { cleanArg } from "./crypto.js";

/**
 * remix_last_image — edit the LAST image aigarth generated in THIS channel, described
 * in words ("put a blue hat on the dog", "make it night"). Uses the stored last-image
 * URL, so the model never has to carry a long URL through a tool arg. Chains: the
 * edited result becomes the new "last image", so follow-up edits stack.
 */
export function makeRemixLastImageTool(channelId: string): AgentTool {
  return {
    name: "remix_last_image",
    label: "Edit Last Image",
    description:
      "Edit the LAST image you generated in this channel, described in words (e.g. 'put a " +
      "blue hat on the dog', 'make it snowy', 'give it a neon vibe'). Use when someone says " +
      "'that last image but…' / 'give me that with…' / 'change the …'. No URL needed. " +
      "strength 0.2=subtle tweak … 0.9=big change (default 0.6).",
    parameters: Type.Object({
      change: Type.String({ description: "What to change about the last image, in words." }),
      strength: Type.Optional(Type.Number({ description: "0.2 (subtle) … 0.9 (big change). Default 0.6." })),
    }),
    execute: async (_id, params: any, signal) => {
      const src = getLastImage(channelId);
      if (!src) {
        return {
          content: [{ type: "text", text: "there's no recent image in this channel to edit — generate one first." }],
          details: {},
        };
      }
      const r = await img2img({ sourceUrl: src, prompt: cleanArg(params.change), strength: Number(params.strength), signal });
      setLastImage(channelId, r.images[0]); // chain further edits off the new result
      return {
        content: [{ type: "text", text: `Edited the last image (strength ${r.strength}). Posting.` }],
        details: { images: r.images, model: r.model, strength: r.strength },
      };
    },
  };
}
