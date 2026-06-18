import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { config } from "../config.js";
import { safeFetchBuffer } from "../util/net.js";

/**
 * describe_image — vision via a SEPARATE, image-capable model (GRID_VISION_MODEL),
 * because the chat model usually isn't multimodal. The skill makes its own
 * OpenAI-compatible /v1/chat/completions call with an image, independent of the
 * agent's text model.
 *
 * Audit fixes vs old vision_handler.py: detect MIME from bytes (don't hardcode
 * image/png), SSRF-guard the fetch, cap size, single configurable model.
 *
 * Image URLs are surfaced into the turn context by the Discord layer, so the
 * agent can pass one here. We base64 it into a data URI so the grid worker
 * doesn't need to fetch external URLs itself.
 */

function sniffMime(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.toString("ascii", 1, 4) === "PNG") return "image/png";
  if (buf.length >= 6 && buf.toString("ascii", 0, 3) === "GIF") return "image/gif";
  if (buf.length >= 12 && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "image/png";
}

export function makeDescribeImageTool(): AgentTool {
  return {
    name: "describe_image",
    label: "Describe Image",
    description:
      "Look at an image (by its URL — e.g. one attached to the user's message, " +
      "shown to you in context) and describe or answer a question about it. " +
      "Use when the user shares/refers to an image.",
    parameters: Type.Object({
      image_url: Type.String({ description: "URL of the image to look at." }),
      question: Type.Optional(
        Type.String({ description: "What to find out (default: describe it)." }),
      ),
    }),
    execute: async (_id, params: any, signal) => {
      if (!config.gridVisionModel) {
        return { content: [{ type: "text", text: "(vision is not configured)" }], details: {} };
      }
      const got = await safeFetchBuffer(params.image_url, { maxBytes: 8_000_000 });
      if (!got) throw new Error("couldn't fetch that image (blocked, private, or too large)");
      const mime = got.contentType.startsWith("image/") ? got.contentType : sniffMime(got.buf);
      const dataUri = `data:${mime};base64,${got.buf.toString("base64")}`;
      const question = params.question?.trim() || "Describe this image in detail.";

      const res = await fetch(`${config.gridVisionV1Url.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.gridApiKey}`,
        },
        body: JSON.stringify({
          model: config.gridVisionModel,
          max_tokens: 600,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: question },
                { type: "image_url", image_url: { url: dataUri } },
              ],
            },
          ],
        }),
        signal,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`vision model error ${res.status}: ${t.slice(0, 200)}`);
      }
      const data = (await res.json()) as any;
      const text = data?.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("vision model returned no description");
      return { content: [{ type: "text", text }], details: { model: config.gridVisionModel } };
    },
  };
}
