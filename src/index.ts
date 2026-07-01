import {
  Client,
  GatewayIntentBits,
  Events,
  AttachmentBuilder,
  Partials,
  ActivityType,
  type Message,
  type MessageMentionOptions,
  type OmitPartialGroupDMChannel,
} from "discord.js";

/** A message from the MessageCreate event — its channel is guaranteed sendable
 *  (the partial group-DM channel, which can't be replied to, is excluded). */
type EventMessage = OmitPartialGroupDMChannel<Message>;
import { config } from "./config.js";
import { log } from "./util/log.js";
import { messages, banVotes, settings, reminders } from "./store/db.js";
import { isCommand, canSend, recordBotSend, botSpokeRecently } from "./discord/gating.js";
import { handleCommand } from "./discord/commands.js";
import { screenMessage, hasUntrustedLink, openBanVote, openModerationVote, handleVoteReaction } from "./discord/scam.js";
import { decideEngagement } from "./discord/gate.js";
import type { DiscordActions } from "./skills/discordActions.js";
import { runTurn } from "./agent.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

const TRACKED = new Set([...config.channels, ...config.readonlyChannels]);

// Bot messages never ping: no reply ping, no @everyone/@here/role pings (the model
// speaks in plain text and addresses people by name, like a person would).
const SAFE_MENTIONS: MessageMentionOptions = { parse: [], repliedUser: false };

// ── Conversation coalescing: ONE attention per channel ───────────────────────
// A real participant doesn't spin up a separate brain per message — it watches the
// channel and responds to where the conversation IS. Each channel has at most one
// turn running at a time; new messages reset a short "settle" timer and update the
// latest state, then a single turn responds to that current state. This structurally
// prevents answering stale messages or posting out of order.
interface Activity {
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
const chanStates = new Map<string, ChanState>();
/** Channels where the bot has muted itself until a timestamp (the snooze tool). */
export const snoozedUntil = new Map<string, number>();

/** Arm the settle timer if not already running/armed. The timer is NOT pushed back
 *  by every new message (that could delay a response indefinitely in a busy channel);
 *  it fires a bounded time after the pending state was first set. */
function arm(channelId: string): void {
  const st = chanStates.get(channelId);
  if (!st || st.running || !st.pending || st.timer) return;
  const settle = st.pending.addressed ? config.convSettleAddressedMs : config.convSettleMs;
  st.timer = setTimeout(() => {
    st.timer = null;
    void runChannelTurn(channelId);
  }, settle);
}

/** Record new channel activity. Newest state wins EXCEPT a pending message the bot
 *  was directly addressed in is sticky — later unaddressed chatter must not bury an
 *  @-mention/reply/name-call before the turn runs (that dropped responses). */
function noteActivity(act: Activity): void {
  const channelId = act.message.channelId;
  let st = chanStates.get(channelId);
  if (!st) {
    st = { timer: null, running: false, pending: null };
    chanStates.set(channelId, st);
  }
  const upgradeToAddressed = act.addressed && !st.pending?.addressed;
  if (!st.pending || act.addressed || !st.pending.addressed) st.pending = act;
  if (st.running) return;
  // If this message upgraded the pending state to "addressed", expedite: cancel the
  // longer unaddressed timer so we respond promptly instead of after the full window.
  if (upgradeToAddressed && st.timer) {
    clearTimeout(st.timer);
    st.timer = null;
  }
  arm(channelId);
}

/** Run a single turn for the channel's current state. One at a time per channel. */
async function runChannelTurn(channelId: string): Promise<void> {
  const st = chanStates.get(channelId);
  if (!st || st.running || !st.pending) return;
  const act = st.pending;
  st.pending = null;
  st.running = true;

  const message = act.message;
  const modTarget = act.modTarget;
  const inTracked = act.inTracked;
  let typingTimer: ReturnType<typeof setInterval> | null = null;
  let typingChannel: any = null;

  try {
    if ((snoozedUntil.get(channelId) ?? 0) > Date.now()) {
      log.debug("snoozed; skipping turn", { ch: channelId });
      return;
    }
    if (!canSend(channelId)) {
      log.warn("per-channel reply ceiling hit; skipping", { channel: channelId });
      return;
    }

    // Structural fast-paths (@-mention / reply-to-bot / DM) always respond and skip
    // the gate. Everything else goes through the cheap gate model, which decides
    // respond / react / ignore — handling ALL addressing judgment (name in any form,
    // implicit address, worth-chiming-in) so there's no name matcher.
    if (!act.addressed) {
      const decision = await decideEngagement({
        history: act.priorHistory,
        latest: act.content,
        userName: message.author.displayName ?? message.author.username,
        recentlyEngaged: botSpokeRecently(channelId),
        chattiness: settings.getChattiness(),
        untrustedLink: act.untrustedLink,
      });
      log.info("gate", {
        ch: channelId,
        action: decision.action,
        emoji: decision.emoji,
        text: act.content.slice(0, 100),
      });
      if (decision.action === "ignore") return;
      if (decision.action === "react") {
        try {
          await modTarget.react(decision.emoji || "👍");
          recordBotSend(channelId);
        } catch (e) {
          log.debug("react failed", { err: String(e) });
        }
        return;
      }
      // respond → fall through to the full chat agent
    }

    const startTyping = (channel: any): void => {
      typingChannel = channel;
      const tick = () => {
        if (typingChannel && "sendTyping" in typingChannel) typingChannel.sendTyping().catch(() => {});
      };
      if (typingTimer) return;
      tick();
      typingTimer = setInterval(tick, 8000);
    };
    const NO_TYPING = new Set([
      "react", "reply", "reply_in_thread", "start_ban_poll", "start_delete_poll",
      "set_channel_status", "remember", "forget", "set_mood", "snooze", "set_chattiness",
    ]);

    const pendingImages: string[] = [];
    let firstReplySent = false;
    let sentAnything = false;

    const postText = async (text: string): Promise<void> => {
      const clean = stripImageMarkdown(text ?? "");
      const files = pendingImages.length ? await fetchAttachments(pendingImages.splice(0)) : [];
      const parts = chunk(clean);
      if (parts.length === 0 && files.length === 0) return;
      if (!firstReplySent) {
        startTyping(message.channel);
        // Inline-reply only if the triggering message is still the latest in the
        // channel; otherwise plain-send so a reply doesn't visibly pin to an old msg.
        const stillCurrent = (message.channel as any).lastMessageId === message.id;
        const payload = { content: parts[0] || undefined, files, allowedMentions: SAFE_MENTIONS };
        if (stillCurrent) await message.reply(payload);
        else await message.channel.send(payload);
        firstReplySent = true;
      } else {
        await message.channel.send({ content: parts[0] || undefined, files, allowedMentions: SAFE_MENTIONS });
      }
      for (const p of parts.slice(1)) await message.channel.send({ content: p, allowedMentions: SAFE_MENTIONS });
      recordBotSend(channelId);
      sentAnything = true;
      if (inTracked && clean) messages.add(channelId, config.botName, clean, client.user?.id ?? null, true);
    };

    const actions: DiscordActions = {
      reply: postText,
      react: async (emoji: string) => {
        await modTarget.react(emoji);
        recordBotSend(channelId);
        sentAnything = true;
      },
      replyInThread: async (text: string, threadName?: string) => {
        try {
          let thread = message.thread ?? null;
          if (!thread && typeof (message as any).startThread === "function") {
            thread = await (message as any).startThread({
              name: (threadName || `chat with ${message.author.displayName ?? message.author.username}`).slice(0, 90),
            });
          }
          if (!thread) return postText(text);
          const parts = chunk(stripImageMarkdown(text));
          const files = pendingImages.length ? await fetchAttachments(pendingImages.splice(0)) : [];
          startTyping(thread);
          await thread.send({ content: parts[0] || undefined, files, allowedMentions: SAFE_MENTIONS });
          for (const p of parts.slice(1)) await thread.send({ content: p, allowedMentions: SAFE_MENTIONS });
          recordBotSend(channelId);
          sentAnything = true;
          if (inTracked && text) messages.add(channelId, config.botName, text, client.user?.id ?? null, true);
        } catch (e) {
          log.debug("thread reply failed; replying inline", { err: String(e) });
          await postText(text);
        }
      },
      startBanPoll: async (reason: string) => {
        if (!message.guild) return;
        await openModerationVote({
          channel: message.channel, guildId: message.guild.id, targetUserId: modTarget.author.id,
          action: "ban", reason, evidence: modTarget.content, targetMsgId: modTarget.id,
        });
        sentAnything = true;
      },
      startDeletePoll: async (reason: string) => {
        if (!message.guild) return;
        await openModerationVote({
          channel: message.channel, guildId: message.guild.id, targetUserId: modTarget.author.id,
          action: "delete", reason, evidence: modTarget.content, targetMsgId: modTarget.id,
        });
        sentAnything = true;
      },
      canModerate: !!message.guild,
      inGuild: !!message.guild,
      snooze: (minutes: number) => {
        snoozedUntil.set(channelId, Date.now() + minutes * 60_000);
        log.info("snoozed channel", { ch: channelId, minutes });
      },
      setNickname: async (name: string) => {
        const clean = name.replace(/[@`]/g, "").slice(0, 32).trim();
        const me = message.guild?.members?.me;
        if (!me) return "can't change nickname here";
        await me.setNickname(clean || null);
        return clean ? `nickname set to ${clean}` : "nickname reset";
      },
      setPresence: async (text: string) => {
        const t = text.replace(/@/g, "").slice(0, 80).trim();
        if (!client.user) return;
        if (!t) client.user.setActivity();
        else client.user.setActivity({ name: t, type: ActivityType.Custom, state: t });
      },
      createPoll: async (question: string, options: string[], hours: number) => {
        await message.channel.send({
          poll: {
            question: { text: question.slice(0, 300) },
            answers: options.slice(0, 10).map((o) => ({ text: o.slice(0, 55) })),
            duration: Math.max(1, Math.min(768, Math.round(hours || 24))), // hours; Discord max 32d
            allowMultiselect: false,
          },
          allowedMentions: SAFE_MENTIONS,
        });
        recordBotSend(channelId);
        sentAnything = true;
      },
      remind: async (text: string, minutes: number) => {
        reminders.add(channelId, message.author.id, text.slice(0, 500), Date.now() + minutes * 60_000);
      },
    };

    log.info("running turn", { ch: channelId, addressed: act.addressed, len: act.content.length });
    const result = await runTurn({
      channelId,
      channelName: ("name" in message.channel ? (message.channel as any).name : undefined) ?? "DM",
      userId: message.author.id,
      userName: message.author.displayName ?? message.author.username,
      text: act.content || "(they pinged you with no other text)",
      imageUrls: act.imageUrls,
      history: act.priorHistory,
      chattiness: settings.getChattiness(),
      mentioned: act.mentioned,
      repliedToBot: act.repliedToBot,
      isDM: act.isDM,
      gateEngaged: !act.addressed, // reached here via the gate, not a structural fast-path
      spokeRecently: botSpokeRecently(channelId),
      actions,
      onImage: (u) => pendingImages.push(u),
      onToolStart: (tool) => {
        if (!NO_TYPING.has(tool)) startTyping(message.channel);
      },
    });

    if (pendingImages.length) await postText("");
    // We only reach the full agent when intending to respond (fast-path or gate→respond),
    // so post its final text if it produced one without calling reply.
    if (!sentAnything && result.finalText) await postText(result.finalText);
    log.info("turn done", { ch: channelId, sent: sentAnything, error: result.error });
  } catch (err) {
    log.error("channel turn error", { err: String(err) });
  } finally {
    if (typingTimer) clearInterval(typingTimer);
    st.running = false;
    if (st.pending) arm(channelId); // activity arrived during the turn → go again
  }
}

client.once(Events.ClientReady, (c) => {
  log.info("aigarth online", { tag: c.user.tag, model: config.gridChatModel });
  // Periodic housekeeping: prune old history + expire stale votes.
  setInterval(() => {
    const removed = messages.cleanup(30);
    banVotes.expire(config.banVoteTtlMs);
    if (removed) log.debug("history cleanup", { removed });
  }, 6 * 3600 * 1000).unref();

  // Reminder delivery: post due reminders (the `remind` tool), pinging the user.
  setInterval(async () => {
    for (const r of reminders.due(Date.now())) {
      try {
        const ch = await client.channels.fetch(r.channel_id).catch(() => null);
        if (ch && "send" in ch) {
          await (ch as any).send({
            content: `⏰ <@${r.user_id}> reminder: ${r.text}`,
            allowedMentions: { users: [r.user_id] },
          });
        }
      } catch (e) {
        log.debug("reminder delivery failed", { err: String(e) });
      }
      reminders.fire(r.id);
    }
  }, 30_000).unref();
});

/** Strip markdown image embeds + attachment:// refs the model sometimes writes
 *  — the real image is posted as a Discord attachment, so these render as broken
 *  raw text. Leaves normal [text](url) links alone (only `![...]()` is removed). */
/** Some models emit a tool call as literal TEXT instead of a real function call —
 *  e.g. `{"tool":"functions.reply","args":{"text":"…"}}` (optionally in a ```json
 *  fence). When that leaks into the reply, unwrap it to the inner text so we post
 *  the message, not the JSON. Non-matching text is returned unchanged. */
function unwrapToolCallText(text: string): string {
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

function stripImageMarkdown(text: string): string {
  return unwrapToolCallText(text)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // ![alt](...)
    .replace(/\battachment:\/\/\S+/g, "") // bare attachment:// refs
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chunk(text: string, size = 1900): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

async function fetchAttachments(urls: string[]): Promise<AttachmentBuilder[]> {
  const files: AttachmentBuilder[] = [];
  for (let i = 0; i < urls.length; i++) {
    try {
      const res = await fetch(urls[i]);
      if (!res.ok) {
        log.warn("image download failed (not posting)", { status: res.status, url: urls[i].slice(0, 80) });
        continue;
      }
      // Name the file by its REAL type (charts are PNG, grid images webp) — a
      // mislabeled extension can fail to embed in Discord.
      const ct = res.headers.get("content-type") ?? "";
      const ext = ct.includes("png") ? "png" : ct.includes("jpeg") ? "jpg" : ct.includes("gif") ? "gif" : "webp";
      files.push(new AttachmentBuilder(Buffer.from(await res.arrayBuffer()), { name: `aigarth_${i + 1}.${ext}` }));
    } catch (e) {
      log.error("attachment fetch failed", { err: String(e) });
    }
  }
  return files;
}

/** Replace Discord mention/emoji markup with readable names so the model — and the
 *  stored transcript — see "@alice", "#general", ":smile:" instead of raw <@123…>
 *  ids. With `stripBot`, the bot's own mention is removed entirely (so an addressed
 *  message reads as the bare request, not "@aigarth hey"). */
function renderMentions(message: Message, opts: { stripBot?: boolean } = {}): string {
  let c = message.content;
  for (const [id, user] of message.mentions.users) {
    if (opts.stripBot && client.user && id === client.user.id) {
      c = c.replaceAll(`<@${id}>`, "").replaceAll(`<@!${id}>`, "");
      continue;
    }
    const name = message.mentions.members?.get(id)?.displayName ?? user.displayName ?? user.username;
    c = c.replaceAll(`<@${id}>`, `@${name}`).replaceAll(`<@!${id}>`, `@${name}`);
  }
  for (const [id, role] of message.mentions.roles) c = c.replaceAll(`<@&${id}>`, `@${role.name}`);
  for (const [id, ch] of message.mentions.channels) c = c.replaceAll(`<#${id}>`, `#${(ch as any).name ?? "channel"}`);
  return c
    .replace(/<a?:(\w+):\d+>/g, ":$1:") // custom emoji <:name:id> → :name:
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// Ingestion: per-message bookkeeping (history, commands, scam, eligibility,
// signals), then hand the channel's current state to the coalescer. The actual
// turn runs in runChannelTurn — one per channel, after a short settle.
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;
    const inTracked = !message.guild || TRACKED.size === 0 || TRACKED.has(message.channelId);
    log.info("msg recv", {
      ch: message.channelId,
      author: message.author.username,
      inTracked,
      len: message.content.length,
      guild: !!message.guild,
    });

    // Snapshot PRIOR history BEFORE storing this message (so it's not duplicated in
    // context), then store the message (mentions resolved to readable names).
    let priorHistory = "";
    if (inTracked) {
      priorHistory = messages.formatRecent(message.channelId, config.historyWindow);
      messages.add(message.channelId, message.author.displayName ?? message.author.username, renderMentions(message), message.author.id, false);
    }

    // `!` commands bypass the agent entirely.
    if (isCommand(message.content)) {
      await handleCommand(message);
      return;
    }

    // Deterministic scam screen (guild messages only). Fail-closed → community vote.
    if (message.guild && inTracked) {
      const verdict = screenMessage(message.content);
      if (verdict.flagged) {
        await openBanVote(message, verdict.reason);
        return;
      }
    }

    // Respond only in active (non-readonly) tracked channels + DMs.
    const respondable = !message.guild
      ? true
      : (config.channels.length === 0 || config.channels.includes(message.channelId)) &&
        !config.readonlyChannels.includes(message.channelId);
    if (!respondable) {
      log.info("skip: not respondable", { ch: message.channelId });
      return;
    }

    const content = renderMentions(message, { stripBot: true });

    // Moderation/react/reply target: the replied-to message if this is a reply, else
    // the triggering message (so "@aigarth ban this" hits the offender, and we can
    // tell when someone is replying to the BOT even with the ping turned off).
    let modTarget: Message = message;
    if (message.reference?.messageId && "messages" in message.channel) {
      modTarget =
        (await message.channel.messages.fetch(message.reference.messageId).catch(() => null)) ?? message;
    }

    // Structured Discord facts (not regex) — handed to the model as context.
    const mentioned = client.user ? message.mentions.has(client.user.id) : false;
    const repliedToBot =
      !!client.user &&
      ((!!message.reference?.messageId && modTarget !== message && modTarget.author?.id === client.user.id) ||
        message.mentions.repliedUser?.id === client.user.id);
    const isDM = !message.guild;
    // Structural fast-paths only — name/implicit addressing is judged by the gate later.
    const addressed = mentioned || repliedToBot || isDM;
    // A link to an unrecognized host (guild only — ban polls need a guild) → route to
    // aigarth's judgment so it can ban-poll a shady one.
    const untrustedLink = !!message.guild && hasUntrustedLink(message.content);

    // A bare "@aigarth" (addressed, no text) is a real ping; unaddressed empty isn't.
    if (!content && message.attachments.size === 0 && !addressed) return;

    const imageUrls = [...message.attachments.values()]
      .filter((a) => (a.contentType ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(a.name ?? ""))
      .map((a) => a.url);

    // Hand the channel's current state to the coalescer (one attention per channel).
    noteActivity({
      message, inTracked, content, priorHistory, modTarget,
      mentioned, repliedToBot, isDM, addressed, untrustedLink, imageUrls,
    });
  } catch (err) {
    log.error("ingest error", { err: String(err) });
  }
});

// Persisted ban-vote tallying via raw reaction events (covers uncached messages).
async function onReaction(reaction: any, user: any, add: boolean) {
  try {
    if (user?.bot) return;
    if (reaction.partial) await reaction.fetch().catch(() => {});
    const emoji = reaction.emoji?.name;
    const messageId = reaction.message?.id;
    if (!emoji || !messageId) return;
    await handleVoteReaction(client, messageId, emoji, user.id, add);
  } catch (e) {
    log.error("reaction handler error", { err: String(e) });
  }
}
client.on(Events.MessageReactionAdd, (r, u) => onReaction(r, u, true));
client.on(Events.MessageReactionRemove, (r, u) => onReaction(r, u, false));

client.on("error", (e) => log.error("client error", { err: String(e) }));
client.on("warn", (m) => log.warn("client warn", { msg: String(m) }));
client.on("shardDisconnect", (_e, id) => log.warn("shard disconnect", { id }));
client.on("shardResume", (id) => log.info("shard resume", { id }));

client.login(config.discordToken);
