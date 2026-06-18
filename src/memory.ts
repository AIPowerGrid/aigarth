/**
 * Agent memory — the fix for aigarth's #1 audit finding (it dumped every stored
 * fact into every prompt with no relevance retrieval).
 *
 * Backed by hindsight (retain/recall/reflect). Kept behind a small interface so
 * it's swappable: if hindsight isn't configured we degrade to a no-op (the bot
 * still runs, just without long-term memory) — and if we ever change backends
 * it's one file, not a rewrite.
 *
 * One bank (config.hindsightBank) holds community memory; we tag each memory
 * with user/channel so recall can be scoped. Reflection runs on the grid (the
 * hindsight server is configured with our /v1), keeping it dogfooded.
 */

import { config } from "./config.js";

export interface MemoryStore {
  enabled: boolean;
  remember(content: string, opts?: { tags?: string[]; context?: string; metadata?: Record<string, string> }): Promise<void>;
  recall(query: string, opts?: { tags?: string[]; maxTokens?: number }): Promise<string[]>;
  reflect(query: string, opts?: { tags?: string[] }): Promise<string | null>;
}

class NullMemory implements MemoryStore {
  enabled = false;
  async remember(): Promise<void> {}
  async recall(): Promise<string[]> {
    return [];
  }
  async reflect(): Promise<string | null> {
    return null;
  }
}

class HindsightMemory implements MemoryStore {
  enabled = true;
  private client: any;
  private bank: string;

  constructor(client: any, bank: string) {
    this.client = client;
    this.bank = bank;
  }

  async remember(
    content: string,
    opts: { tags?: string[]; context?: string; metadata?: Record<string, string> } = {},
  ): Promise<void> {
    await this.client.retain(this.bank, content, {
      tags: opts.tags,
      context: opts.context,
      metadata: opts.metadata,
      async: true, // don't block the chat turn on extraction
    });
  }

  async recall(query: string, opts: { tags?: string[]; maxTokens?: number } = {}): Promise<string[]> {
    const res = await this.client.recall(this.bank, query, {
      tags: opts.tags,
      maxTokens: opts.maxTokens ?? 1024,
    });
    const results = (res?.results ?? []) as Array<{ text?: string }>;
    return results.map((r) => r.text).filter((t): t is string => !!t);
  }

  async reflect(query: string, opts: { tags?: string[] } = {}): Promise<string | null> {
    const res = await this.client.reflect(this.bank, query, { tags: opts.tags });
    return (res?.text as string) ?? (res?.summary as string) ?? null;
  }
}

let _memory: MemoryStore | null = null;

export async function getMemory(): Promise<MemoryStore> {
  if (_memory) return _memory;
  if (!config.hindsightUrl) {
    _memory = new NullMemory();
    return _memory;
  }
  try {
    const { HindsightClient } = await import("@vectorize-io/hindsight-client");
    const client = new HindsightClient({
      baseUrl: config.hindsightUrl,
      apiKey: config.hindsightApiKey || undefined,
      userAgent: "aigarth-agent/0.1.0",
    } as any);
    // Ensure the bank exists (best-effort; ignore if the helper isn't available).
    try {
      const mod: any = await import("@vectorize-io/hindsight-client");
      if (typeof mod.createOrUpdateBank === "function") {
        await mod.createOrUpdateBank({ client: (client as any).client, path: { bank_id: config.hindsightBank } }).catch(() => {});
      }
    } catch {
      /* ignore */
    }
    _memory = new HindsightMemory(client, config.hindsightBank);
    console.log(`memory: hindsight @ ${config.hindsightUrl} (bank: ${config.hindsightBank})`);
  } catch (e) {
    console.error("memory: hindsight init failed, running without long-term memory:", e);
    _memory = new NullMemory();
  }
  return _memory;
}
