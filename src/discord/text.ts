/**
 * Pure text helpers for outgoing messages — no Discord/network deps, so they're
 * unit-testable in isolation (see text.test.ts).
 */

/** Some models emit a tool call as literal TEXT instead of a real function call —
 *  e.g. `{"tool":"functions.reply","args":{"text":"…"}}` (optionally in a ```json
 *  fence). When that leaks into the reply, unwrap it to the inner text so we post
 *  the message, not the JSON. Non-matching text is returned unchanged. */
export function unwrapToolCallText(text: string): string {
  let body = text.trim();
  const fence = body.match(/^```(?:json|tool_call)?\s*([\s\S]*?)\s*```$/i);
  if (fence) body = fence[1].trim();
  if (!(body.startsWith("{") && body.endsWith("}") && /"text"\s*:/.test(body))) return text;
  try {
    const o = JSON.parse(body);
    const inner = o?.args?.text ?? o?.parameters?.text ?? o?.text ?? o?.arguments?.text;
    if (typeof inner === "string" && inner.trim()) return inner.trim();
  } catch {
    /* not valid JSON — leave as-is */
  }
  return text;
}

/** Strip markdown image embeds + `attachment://` refs the model sometimes writes —
 *  the real image is posted as a Discord attachment, so these would render as broken
 *  raw text. Leaves normal `[text](url)` links alone. Also unwraps leaked tool-call JSON. */
export function stripImageMarkdown(text: string): string {
  return unwrapToolCallText(text)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // ![alt](...)
    .replace(/\battachment:\/\/\S+/g, "") // bare attachment:// refs
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Split a message into Discord-sized chunks (default just under the 2000 limit). */
export function chunk(text: string, size = 1900): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}
