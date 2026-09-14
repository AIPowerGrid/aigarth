import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { config } from "../config.js";

const views = {
  overview: "/v1/status/network",
  models: "/v1/status/models",
  text_models: "/v1/models",
  validator_capabilities: "/v1/validator/capabilities",
} as const;

/** Only fixed public endpoints, no credentials, no redirects or inferred zeros. */
export async function publicSnapshot(url: string, signal?: AbortSignal): Promise<any> {
  const fetched_at = new Date().toISOString();
  try {
    const res = await fetch(url, { redirect: "error", headers: { Accept: "application/json" },
      signal: AbortSignal.any([AbortSignal.timeout(12000), ...(signal ? [signal] : [])]) });
    const reader = res.body?.getReader();
    if (!reader) throw new Error("empty response");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 256000) throw new Error("response too large");
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    if (!res.ok) return { source: url, fetched_at, available: false, http_status: res.status,
      note: "Lookup failed; do not infer bad user credentials, zero workers or an outage." };
    return { source: url, fetched_at, available: true, untrusted_data: JSON.parse(Buffer.concat(chunks).toString()) };
  } catch {
    return { source: url, fetched_at, available: false, note: "Lookup unavailable. Current state is unknown." };
  }
}
const result = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }], details: {} });
const base = () => config.gridStatusUrl.replace(/\/$/, "");

export function makeGridStatusTool(): AgentTool {
  return {
    name: "grid_status", label: "Grid status",
    description: "Read live public Grid state with source and timestamp. Use validator_capabilities for enabled methods, text_models for served IDs, models for inventory, overview for totals. A capability snapshot does NOT inspect the user's request, authentication or config: a disabled lane is only a likely explanation of their error, never proof their key is fine or that enabling it will fix everything. Missing data means unknown, not zero. This lookup needs no auth; user assignments still do.",
    parameters: Type.Object({ view: Type.Optional(Type.Union(Object.keys(views).map(v => Type.Literal(v)))) }),
    execute: async (_id, p: any, signal) => {
      const path = views[(p.view ?? "overview") as keyof typeof views];
      if (!path) throw new Error("Unknown status view");
      return result(await publicSnapshot(base() + path, signal));
    },
  };
}
export function makeValidatorStatusTool(): AgentTool {
  return {
    name: "validator_status", label: "Public validator health",
    description: "Read public registration, heartbeat and evidence health for one val_ ID. Not access to private keys/accounts and not proof of operator independence. A lane error alone does not mean the whole validator is offline.",
    parameters: Type.Object({ validator_id: Type.String({ pattern: "^val_[a-f0-9]{32}$" }) }),
    execute: async (_id, p: any, signal) => {
      if (!/^val_[a-f0-9]{32}$/.test(p.validator_id)) throw new Error("Invalid public validator ID");
      return result(await publicSnapshot(base() + "/v1/validator/public/" + p.validator_id, signal));
    },
  };
}
const repositories = ["grid-validator", "grid-text-worker", "grid-media-worker"] as const;
export function makeReleaseInfoTool(): AgentTool {
  return {
    name: "release_info", label: "Official releases",
    description: "Read recent published AIPowerGrid releases, including previews. Reports prerelease flags, dates and source links; this is not proof a feature is enabled on Core. Never invent an upgrade/rollback fix from the version alone.",
    parameters: Type.Object({ repository: Type.Union(repositories.map(r => Type.Literal(r))) }),
    execute: async (_id, p: any, signal) => {
      if (!repositories.includes(p.repository)) throw new Error("Unsupported repository");
      const snapshot = await publicSnapshot(`https://api.github.com/repos/AIPowerGrid/${p.repository}/releases?per_page=5`, signal);
      if (snapshot.available) {
        if (!Array.isArray(snapshot.untrusted_data)) return result({ ...snapshot, available: false, untrusted_data: undefined });
        snapshot.untrusted_data = snapshot.untrusted_data.filter((r: any) => !r.draft).map((r: any) => ({
          version: r.tag_name, prerelease: r.prerelease, published_at: r.published_at, url: r.html_url,
          notes: typeof r.body === "string" ? r.body.slice(0, 3500) : "",
        }));
      }
      return result(snapshot);
    },
  };
}
