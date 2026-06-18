import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { config } from "../config.js";

/**
 * grid_status — live state of the AI Power Grid (worker counts, queue, which
 * models are online). This is the dogfooding showcase: the agent answers
 * "how's the grid?" with real numbers from the network it runs on.
 *
 * Reads the public horde-style status API (no key needed). Short cache so a
 * burst of "how many workers?" questions doesn't hammer the endpoint.
 */

const cache = new Map<string, { v: any; exp: number }>();
const TTL = 20_000;

async function get(path: string, signal?: AbortSignal): Promise<any> {
  const hit = cache.get(path);
  if (hit && hit.exp > Date.now()) return hit.v;
  const res = await fetch(`${config.gridStatusUrl.replace(/\/$/, "")}${path}`, {
    headers: { "Client-Agent": "aigarth-agent:0.1" },
    signal,
  });
  if (!res.ok) throw new Error(`grid status ${res.status}`);
  const v = await res.json();
  cache.set(path, { v, exp: Date.now() + TTL });
  return v;
}

function modelSummary(models: any[]): Array<{ name: string; workers: number; queued: number; eta: number }> {
  return (models ?? [])
    .map((m) => ({ name: m.name, workers: m.count ?? 0, queued: m.queued ?? 0, eta: m.eta ?? 0 }))
    .filter((m) => m.workers > 0)
    .sort((a, b) => b.workers - a.workers);
}

export function makeGridStatusTool(): AgentTool {
  return {
    name: "grid_status",
    label: "Grid Status",
    description:
      "Get live AI Power Grid status — worker counts, queue depth, and which " +
      "text/image models are online (with how many workers serve each). Use for " +
      "'how's the grid?', 'how many workers?', 'what models are available?'.",
    parameters: Type.Object({
      view: Type.Optional(
        Type.String({
          description:
            "What to report: 'overview' (default), 'text_models', or 'image_models'.",
        }),
      ),
    }),
    execute: async (_id, params: any, signal) => {
      const view = (params.view ?? "overview").toLowerCase();

      if (view === "text_models" || view === "image_models") {
        const type = view === "text_models" ? "text" : "image";
        const models = modelSummary(await get(`/api/v2/status/models?type=${type}`, signal));
        return {
          content: [{ type: "text", text: JSON.stringify({ type, models }) }],
          details: { type, count: models.length },
        };
      }

      // overview: performance + a compact model roll-up
      const [perf, textModels, imageModels] = await Promise.all([
        get(`/api/v2/status/performance`, signal),
        get(`/api/v2/status/models?type=text`, signal),
        get(`/api/v2/status/models?type=image`, signal),
      ]);
      const overview = {
        text_workers: perf.text_worker_count ?? 0,
        image_workers: perf.worker_count ?? 0,
        queued_text_requests: perf.queued_text_requests ?? 0,
        queued_image_requests: perf.queued_requests ?? 0,
        text_models: modelSummary(textModels).slice(0, 12),
        image_models: modelSummary(imageModels).slice(0, 12),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(overview) }],
        details: { text_workers: overview.text_workers, image_workers: overview.image_workers },
      };
    },
  };
}
