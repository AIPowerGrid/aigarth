import type { Message, OmitPartialGroupDMChannel } from "discord.js";

/** A message from the MessageCreate event — its channel is guaranteed sendable. */
export type EventMessage = OmitPartialGroupDMChannel<Message>;

/** Everything the runner needs to process one channel turn. */
export interface Activity {
  message: EventMessage;
  inTracked: boolean;
  /** False for history-only channels: safety review may run, visible
   * participation may not. */
  respondable: boolean;
  content: string;
  modTarget: Message;
  mentioned: boolean;
  repliedToBot: boolean;
  named: boolean;
  isDM: boolean;
  addressed: boolean;
  /** Discord reported this focus deleted shortly after posting. It receives a
   * protected review slot, but deletion alone is never a guilty verdict. */
  deleted?: boolean;
  imageUrls: string[];
}

interface ChanState {
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  pending: Activity[];
}

export interface Coalescer {
  /** Record new channel activity and (re)arm the settle timer. */
  noteActivity(act: Activity): void;
}

/**
 * Preserve each eligible event in arrival order with one running turn per channel.
 * Each turn fetches current context; only the model decides relevance. No message
 * is discarded because it lacks a mention or arrives during another turn.
 */
export function createCoalescer(opts: {
  run: (act: Activity) => Promise<void>;
  settleMs: number;
  settleAddressedMs: number;
}): Coalescer {
  const chanStates = new Map<string, ChanState>();

  function arm(channelId: string): void {
    const st = chanStates.get(channelId);
    // Not pushed back by every message (that could delay a response indefinitely in a
    // busy channel); fires a bounded time after the pending state was first set.
    if (!st || st.running || !st.pending.length || st.timer) return;
    const settle = opts.settleMs;
    st.timer = setTimeout(() => {
      st.timer = null;
      void runChannelTurn(channelId);
    }, settle);
  }

  function noteActivity(act: Activity): void {
    const channelId = act.message.channelId;
    let st = chanStates.get(channelId);
    if (!st) {
      st = { timer: null, running: false, pending: [] };
      chanStates.set(channelId, st);
    }
    // Preserve every eligible message. Dedup only the same pending event, never
    // prioritize or discard based on addressing/content. Deletion is a new event.
    if (act.message.id && st.pending.some(p => p.message.id === act.message.id && !!p.deleted === !!act.deleted)) return;
    st.pending.push(act);
    if (st.running) return;
    arm(channelId);
  }

  async function runChannelTurn(channelId: string): Promise<void> {
    const st = chanStates.get(channelId);
    if (!st || st.running || !st.pending.length) return;
    const act = st.pending.shift()!;
    st.running = true;
    try {
      await opts.run(act);
    } catch {
      /* the runner logs its own errors */
    } finally {
      st.running = false;
      if (st.pending.length) arm(channelId);
      else chanStates.delete(channelId);
    }
  }

  return { noteActivity };
}
