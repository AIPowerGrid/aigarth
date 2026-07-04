/**
 * Per-channel memory of the last image aigarth generated, so it can edit "that last
 * image" without the model having to carry a long URL through a tool arg (which some
 * models garble). In-memory + ephemeral — fine for "the image I just made".
 */
const store = new Map<string, { url: string; ts: number }>();

export function setLastImage(channelId: string, url: string): void {
  if (url) store.set(channelId, { url, ts: Date.now() });
}

export function getLastImage(channelId: string): string | undefined {
  return store.get(channelId)?.url;
}
