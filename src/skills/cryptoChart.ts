import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { cgGet, cleanArg } from "./crypto.js";

/**
 * crypto_chart — a candlestick price chart (with a volume overlay) as an image,
 * posted to the channel. Rendered via QuickChart (hosted Chart.js → PNG, financial
 * plugin) so there are zero native deps; the URL rides in details.images like
 * generate_image. Data: CoinGecko OHLC for candles + market_chart for volume.
 */

const TIMEFRAMES: Record<string, number> = { "1d": 1, "7d": 7, "14d": 14, "30d": 30, "90d": 90, "180d": 180, "1y": 365 };

/** Reduce candle count WITHOUT leaving time-axis gaps: when there are too many
 *  candles, merge consecutive ones into a single OHLC bucket (open=first close=last,
 *  high=max, low=min) so the timeline stays continuous. Dropping points instead would
 *  punch holes in a time-scale chart. No reduction when already a sane count. */
function aggregate(
  ohlc: [number, number, number, number, number][],
  maxBars: number,
): [number, number, number, number, number][] {
  if (ohlc.length <= maxBars) return ohlc;
  const group = Math.ceil(ohlc.length / maxBars);
  const out: [number, number, number, number, number][] = [];
  for (let i = 0; i < ohlc.length; i += group) {
    const g = ohlc.slice(i, i + group);
    out.push([
      g[0][0], // bucket timestamp = first
      g[0][1], // open = first open
      Math.max(...g.map((c) => c[2])), // high
      Math.min(...g.map((c) => c[3])), // low
      g[g.length - 1][4], // close = last close
    ]);
  }
  return out;
}

function timeUnit(days: number): string {
  if (days <= 1) return "hour";
  if (days <= 30) return "day";
  if (days <= 90) return "week";
  return "month";
}

const UP = "rgb(38,166,154)";
const DOWN = "rgb(239,83,80)";

/** Trim float precision to keep the QuickChart GET URL well under its size limit. */
function rp(n: number): number {
  if (n >= 1000) return Math.round(n);
  if (n >= 1) return Math.round(n * 100) / 100;
  return Number(n.toPrecision(4));
}

export function makeCryptoChartTool(): AgentTool {
  return {
    name: "crypto_chart",
    label: "Crypto Chart",
    description:
      "Generate and post a CANDLESTICK price chart (with a volume overlay) for a coin " +
      "by CoinGecko id, over a chosen timeframe. Use when someone wants to see the price " +
      "action, not just a number. You can pull different timeframes (1d/7d/30d/90d/1y) and " +
      "compare. Pass type:'line' for a simple line instead of candles.",
    parameters: Type.Object({
      coin_id: Type.String({ description: "CoinGecko coin id, e.g. 'ai-power-grid', 'bitcoin'." }),
      timeframe: Type.Optional(
        Type.String({ description: "1d, 7d, 14d, 30d, 90d, 180d, or 1y (default 30d)." }),
      ),
      type: Type.Optional(Type.String({ description: "'candlestick' (default) or 'line'." })),
    }),
    execute: async (_id, params: any, signal) => {
      const id = cleanArg(params.coin_id, true).toLowerCase();
      const tf = (cleanArg(params.timeframe, true) || "30d").toLowerCase();
      const days = TIMEFRAMES[tf] ?? (Number(tf) > 0 ? Math.min(365, Math.round(Number(tf))) : 30);
      const wantLine = cleanArg(params.type, true).toLowerCase() === "line";

      // OHLC candles + volume series (separate CoinGecko endpoints).
      const [ohlcRaw, mc] = await Promise.all([
        cgGet(`/coins/${encodeURIComponent(id)}/ohlc?vs_currency=usd&days=${days}`, signal),
        cgGet(`/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}`, signal),
      ]);
      const ohlc: [number, number, number, number, number][] = Array.isArray(ohlcRaw) ? ohlcRaw : [];
      if (ohlc.length === 0) throw new Error(`no OHLC history for "${id}" (wrong id?)`);
      const vols: [number, number][] = mc?.total_volumes ?? [];

      // Aggregate only if very dense (keeps the timeline gap-free); attach the
      // nearest volume to each candle (both series are time-sorted).
      const candles = aggregate(ohlc, 120);
      let vi = 0;
      const data = candles.map(([ts, o, h, l, c]) => {
        while (vi < vols.length - 1 && vols[vi + 1][0] <= ts) vi++;
        return { x: ts, o: rp(o), h: rp(h), l: rp(l), c: rp(c), v: Math.round(vols[vi]?.[1] ?? 0) };
      });

      const firstC = data[0].c;
      const lastC = data[data.length - 1].c;
      const pct = ((lastC - firstC) / firstC) * 100;
      const maxVol = Math.max(1, ...data.map((d) => d.v));
      const title = `${id.toUpperCase()} / USD — ${tf}  ${pct >= 0 ? "▲" : "▼"} ${pct.toFixed(1)}%`;

      const priceDataset = wantLine
        ? {
            label: `${id} USD`,
            type: "line",
            data: data.map((d) => ({ x: d.x, y: d.c })),
            borderColor: pct >= 0 ? UP : DOWN,
            backgroundColor: (pct >= 0 ? UP : DOWN).replace("rgb", "rgba").replace(")", ",0.12)"),
            fill: true,
            pointRadius: 0,
            borderWidth: 2,
            tension: 0.2,
          }
        : {
            label: `${id} USD`,
            data: data.map((d) => ({ x: d.x, o: d.o, h: d.h, l: d.l, c: d.c })),
            color: { up: UP, down: DOWN, unchanged: "#888" },
            borderColor: { up: UP, down: DOWN, unchanged: "#888" },
          };

      const chart = {
        type: wantLine ? "line" : "candlestick",
        data: {
          datasets: [
            priceDataset,
            {
              label: "Volume",
              type: "bar",
              yAxisID: "vol",
              data: data.map((d) => ({ x: d.x, y: d.v })),
              backgroundColor: "rgba(120,144,170,0.35)",
              borderWidth: 0,
            },
          ],
        },
        options: {
          plugins: {
            title: { display: true, text: title },
            legend: { display: false },
          },
          scales: {
            x: { type: "time", time: { unit: timeUnit(days) }, ticks: { maxTicksLimit: 8 } },
            y: { position: "left", ticks: {} },
            // Volume bars confined to the bottom ~25% via an inflated, hidden axis.
            vol: { position: "right", display: false, beginAtZero: true, max: maxVol * 4, grid: { display: false } },
          },
        },
      };

      const url =
        "https://quickchart.io/chart?version=4&w=720&h=400&bkg=white&c=" +
        encodeURIComponent(JSON.stringify(chart));

      const fmt = (n: number) => (n < 1 ? n.toPrecision(3) : n.toLocaleString("en-US", { maximumFractionDigits: 2 }));
      return {
        content: [
          {
            type: "text",
            text: `${wantLine ? "Line" : "Candlestick"} chart for ${id} (${tf}): $${fmt(firstC)} → $${fmt(lastC)} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%). Posting it.`,
          },
        ],
        details: { images: [url], coin: id, timeframe: tf, days, change_pct: pct },
      };
    },
  };
}
