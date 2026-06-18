/**
 * URL extraction + SSRF guard.
 *
 * The audit flagged the old link-preview/vision/ingest paths as SSRF holes
 * (they fetched arbitrary user URLs server-side with no private-IP guard) —
 * the highest-severity finding given the prior chat-box RCE. Any server-side
 * fetch of a user-supplied URL MUST go through `isSafePublicUrl` first.
 */

import { lookup } from "node:dns/promises";
import net from "node:net";

const URL_RE = /\bhttps?:\/\/[^\s<>()\[\]]+/gi;

/** Extract http(s) URLs from text, trimming trailing punctuation, deduped. */
export function extractUrls(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(URL_RE)) {
    let u = m[0].replace(/[.,!?;:'")\]]+$/, "");
    const key = u.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(u);
    }
  }
  return out;
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    return (
      low === "::1" ||
      low.startsWith("fe80") || // link-local
      low.startsWith("fc") ||
      low.startsWith("fd") || // unique-local
      low.startsWith("::ffff:") // v4-mapped — resolve separately if needed
    );
  }
  return true; // unknown form → unsafe
}

/**
 * True only if `raw` is a well-formed http(s) URL whose host resolves to a
 * public IP. Blocks localhost, private ranges, link-local, and cloud metadata.
 */
export async function isSafePublicUrl(raw: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname;
  if (!host || host === "localhost") return false;
  // If the host is a literal IP, check it directly.
  if (net.isIP(host)) return !isPrivateIp(host);
  try {
    const addrs = await lookup(host, { all: true });
    if (addrs.length === 0) return false;
    return addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

/** Fetch with SSRF guard + size + time caps. Returns text (capped) or null. */
export async function safeFetchText(
  raw: string,
  { maxBytes = 512_000, timeoutMs = 5000 }: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<string | null> {
  if (!(await isSafePublicUrl(raw))) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(raw, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "aigarth-agent/0.1 (+https://aipowergrid.io)" },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.subarray(0, maxBytes).toString("utf-8");
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** SSRF-guarded binary fetch with size + time caps. Returns bytes + content-type. */
export async function safeFetchBuffer(
  raw: string,
  { maxBytes = 8_000_000, timeoutMs = 15000 }: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<{ buf: Buffer; contentType: string } | null> {
  if (!(await isSafePublicUrl(raw))) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(raw, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "aigarth-agent/0.1 (+https://aipowergrid.io)" },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) return null;
    return { buf, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Registered-ish host of a URL for allow/deny matching (not substring hacks). */
export function hostOf(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}
