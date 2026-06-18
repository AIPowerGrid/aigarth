import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { config } from "../config.js";

/**
 * Crypto skills — replaces coingecko_mcp.py's regex "intent router" that ran a
 * speculative network call on every message. Now the model calls these only
 * when relevant. CoinGecko REST (the MCP path was stale per the old code's own
 * comments), one correct key header by tier, short TTL cache, structured output
 * (the agent formats — tools return data, not pre-formatted strings).
 */

const CG = "https://api.coingecko.com/api/v3";
const cache = new Map<string, { v: any; exp: number }>();
const TTL = 45_000;

function keyHeaders(): Record<string, string> {
  if (!config.coingeckoApiKey) return {};
  return { [config.coingeckoPro ? "X-Cg-Pro-Api-Key" : "X-Cg-Demo-Api-Key"]: config.coingeckoApiKey };
}

export async function cgGet(path: string, signal?: AbortSignal): Promise<any> {
  const hit = cache.get(path);
  if (hit && hit.exp > Date.now()) return hit.v;
  const res = await fetch(`${CG}${path}`, { headers: keyHeaders(), signal });
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const v = await res.json();
  cache.set(path, { v, exp: Date.now() + TTL });
  return v;
}

export function makeCryptoPriceTool(): AgentTool {
  return {
    name: "crypto_price",
    label: "Crypto Price",
    description:
      "Get the current USD price and 24h change for a coin by its CoinGecko id " +
      "(e.g. 'bitcoin', 'ethereum', 'ai-power-grid'). Use search_coin first if " +
      "you only have a name/symbol.",
    parameters: Type.Object({
      coin_id: Type.String({ description: "CoinGecko coin id, e.g. 'ai-power-grid'." }),
    }),
    execute: async (_id, params: any, signal) => {
      const id = String(params.coin_id).toLowerCase().trim();
      const data = await cgGet(
        `/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true`,
        signal,
      );
      const row = data[id];
      if (!row) throw new Error(`no price for "${id}" (wrong id? try search_coin)`);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ id, usd: row.usd, change_24h_pct: row.usd_24h_change }),
          },
        ],
        details: { id, usd: row.usd, change24h: row.usd_24h_change },
      };
    },
  };
}

export function makeSearchCoinTool(): AgentTool {
  return {
    name: "search_coin",
    label: "Search Coin",
    description: "Resolve a coin name or symbol to CoinGecko ids. Returns top matches.",
    parameters: Type.Object({
      query: Type.String({ description: "Name or symbol, e.g. 'AIPG' or 'power grid'." }),
    }),
    execute: async (_id, params: any, signal) => {
      const data = await cgGet(`/search?query=${encodeURIComponent(params.query)}`, signal);
      const coins = (data.coins ?? []).slice(0, 8).map((c: any) => ({
        id: c.id,
        symbol: c.symbol,
        name: c.name,
        rank: c.market_cap_rank,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(coins) }],
        details: { count: coins.length },
      };
    },
  };
}
