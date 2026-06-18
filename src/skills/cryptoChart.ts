import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { cgGet } from "./crypto.js";

/**
 * crypto_chart — price chart as an image, posted to the channel.
 *
 * Per the audit, we render via QuickChart (a hosted Chart.js→PNG service)
 * instead of porting coingecko_mcp.py's heavy, hand-rolled matplotlib
 * candlestick drawing. Zero native deps; returns an image URL the Discord layer
 * posts (same path as generate_image — agent.ts collects details.images from any
 * skill). Downsamples points so the URL stays small.
 */

function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

export function makeCryptoChartTool(): AgentTool {
  return {
    name: "crypto_chart",
    label: "Crypto Chart",
    description:
      "Generate and post a price chart image for a coin (by CoinGecko id) over N " +
      "days. Use when the user wants to see the price trend, not just a number.",
    parameters: Type.Object({
      coin_id: Type.String({ description: "CoinGecko coin id, e.g. 'ai-power-grid'." }),
      days: Type.Optional(Type.Number({ description: "Days of history (1-365, default 30)." })),
    }),
    execute: async (_id, params: any, signal) => {
      const id = String(params.coin_id).toLowerCase().trim();
      const days = Math.max(1, Math.min(Number(params.days ?? 30), 365));
      const data = await cgGet(
        `/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}`,
        signal,
      );
      const prices: [number, number][] = data?.prices ?? [];
      if (prices.length === 0) throw new Error(`no price history for "${id}" (wrong id?)`);

      const pts = downsample(prices, 80);
      const labels = pts.map(([ts]) =>
        new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      );
      const values = pts.map(([, v]) => Number(v.toPrecision(6)));
      const first = values[0];
      const last = values[values.length - 1];
      const up = last >= first;
      const color = up ? "rgb(51,204,119)" : "rgb(255,85,85)";

      const chart = {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: `${id} USD`,
              data: values,
              borderColor: color,
              backgroundColor: color.replace("rgb", "rgba").replace(")", ",0.15)"),
              fill: true,
              pointRadius: 0,
              borderWidth: 2,
              tension: 0.25,
            },
          ],
        },
        options: {
          plugins: {
            title: { display: true, text: `${id} — ${days}d (${up ? "▲" : "▼"} ${(((last - first) / first) * 100).toFixed(1)}%)` },
            legend: { display: false },
          },
          scales: { x: { ticks: { maxTicksLimit: 8 } } },
        },
      };

      const url =
        "https://quickchart.io/chart?w=640&h=320&bkg=white&c=" +
        encodeURIComponent(JSON.stringify(chart));

      return {
        content: [
          {
            type: "text",
            text: `Chart for ${id} (${days}d): $${first.toPrecision(4)} → $${last.toPrecision(4)}. Posting it.`,
          },
        ],
        details: { images: [url], coin: id, days, change_pct: ((last - first) / first) * 100 },
      };
    },
  };
}
