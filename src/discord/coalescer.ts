import type { Message, OmitPartialGroupDMChannel } from "discord.js";

/** A message from the MessageCreate event — its channel is guaranteed sendable. */
export type EventMessage = OmitPartialGroupDMChannel<Message>;

/** Everything the runner needs to process one channel turn. */
export interface Activity {
  message: EventMessage;
  inTracked: boolean;
  content: string;
  priorHistory: string;
  modTarget: Message;
  mentioned: boolean;
  repliedToBot: boolean;
  isDM: boolean;
  addressed: boolean;
  untrustedLink: boolean;
  imageUrls: string[];
}

interface ChanState {
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  pending: Activity | null; // latest activity awaiting a turn (newest wins)
}

export interface Coalescer {
  /** Record new channel activity and (re)arm the settle timer. */
  noteActivity(act: Activity): void;
  /** Mute the bot in a channel for `ms` (the snooze tool). */
  snooze(channelId: string, ms: number): void;
  /** Is the channel currently snoozed? */
  isSnoozed(channelId: string): boolean;
}

/**
 * Conversation coalescing: ONE attention per channel. A real participant doesn't
 * spin up a separate brain per message — it watches the channel and responds to
 * where the conversation IS. At most one turn runs per channel; new messages update
 * the pending state (newest wins, but a pending ADDRESSED message is sticky so later
 * chatter can't bury an @-mention) and arm a short settle timer, after which the
 * injected `run` processes the current state. Structurally prevents answering stale
 * messages or posting out of order.
 *
 * `run` is injected (the real gate+agent+post pipeline in production, a mock in tests).
 */
export function createCoalescer(opts: {
  run: (act: Activity) => Promise<void>;
  settleMs: number;
  settleAddressedMs: number;
  now?: () => number;
}): Coalescer {
  const now = opts.now ?? Date.now;
  const chanStates = new Map<string, ChanState>();
  const snoozedUntil = new Map<string, number>();

  function arm(channelId: string): void {
    const st = chanStates.get(channelId);
    // Not pushed back by every message (that could delay a response indefinitely in a
    // busy channel); fires a bounded time after the pending state was first set.
    if (!st || st.running || !st.pending || st.timer) return;
    const settle = st.pending.addressed ? opts.settleAddressedMs : opts.settleMs;
    st.timer = setTimeout(() => {
      st.timer = null;
      void runChannelTurn(channelId);
    }, settle);
  }

  function noteActivity(act: Activity): void {
    const channelId = act.message.channelId;
    let st = chanStates.get(channelId);
    if (!st) {
      st = { timer: null, running: false, pending: null };
      chanStates.set(channelId, st);
    }
    const upgradeToAddressed = act.addressed && !st.pending?.addressed;
    // Newest wins EXCEPT a pending addressed message is sticky vs later unaddressed.
    if (!st.pending || act.addressed || !st.pending.addressed) st.pending = act;
    if (st.running) return;
    // Upgraded to addressed → expedite: cancel the longer unaddressed timer.
    if (upgradeToAddressed && st.timer) {
      clearTimeout(st.timer);
      st.timer = null;
    }
    arm(channelId);
  }

  async function runChannelTurn(channelId: string): Promise<void> {
    const st = chanStates.get(channelId);
    if (!st || st.running || !st.pending) return;
    const act = st.pending;
    st.pending = null;
    st.running = true;
    try {
      if ((snoozedUntil.get(channelId) ?? 0) > now()) return; // snoozed → skip
      await opts.run(act);
    } catch {
      /* the runner logs its own errors */
    } finally {
      st.running = false;
      if (st.pending) arm(channelId); // activity arrived during the turn → go again
    }
  }

  return {
    noteActivity,
    snooze: (channelId, ms) => snoozedUntil.set(channelId, now() + ms),
    isSnoozed: (channelId) => (snoozedUntil.get(channelId) ?? 0) > now(),
  };
}
