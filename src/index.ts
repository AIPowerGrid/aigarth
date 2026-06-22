import {
  Client,
  GatewayIntentBits,
  Events,
  AttachmentBuilder,
  Partials,
  type Message,
  type MessageMentionOptions,
} from "discord.js";
import { config } from "./config.js";
import { log } from "./util/log.js";
import { messages, banVotes, settings } from "./store/db.js";
import { passCooldown, isCommand, canSend, recordBotSend, botSpokeRecently } from "./discord/gating.js";
import { handleCommand } from "./discord/commands.js";
import { screenMessage, openBanVote, openModerationVote, handleVoteReaction } from "./discord/scam.js";
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

// Burst coalescing state: latest message id per (channel, author).
const burstLatest = new Map<string, string>();

client.once(Events.ClientReady, (c) => {
  log.info("aigarth online", { tag: c.user.tag, model: config.gridChatModel });
  // Periodic housekeeping: prune old history + expire stale votes.
  setInterval(() => {
    const removed = messages.cleanup(30);
    banVotes.expire(config.banVoteTtlMs);
    if (removed) log.debug("history cleanup", { removed });
  }, 6 * 3600 * 1000).unref();
});

/** Strip markdown image embeds + attachment:// refs the model sometimes writes
 *  — the real image is posted as a Discord attachment, so these render as broken
 *  raw text. Leaves normal [text](url) links alone (only `![...]()` is removed). */
function stripImageMarkdown(text: string): string {
  return text
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

client.on(Events.MessageCreate, async (message) => {
  // Typing-heartbeat + channel-lock state, hoisted so the `finally` can always
  // clean them up regardless of where we return.
  let typingTimer: ReturnType<typeof setInterval> | null = null;
  let typingChannel: any = null;
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

    // Snapshot PRIOR history BEFORE storing this message, so the agent sees the
    // earlier conversation and the current message appears exactly once (as the
    // "Latest —" line in contextBlock), not duplicated in the transcript too.
    // Stored content has mentions resolved to names, so the transcript reads naturally.
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

    // Mechanical eligibility ONLY — no content decision. We respond in active
    // (non-readonly) tracked channels + DMs; whether/how to engage is the model's
    // call below.
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
    // the triggering message itself (so "@aigarth ban this" hits the offender, and
    // we can tell when someone is replying to the BOT even with the ping turned off).
    let modTarget: Message = message;
    if (message.reference?.messageId && "messages" in message.channel) {
      modTarget =
        (await message.channel.messages.fetch(message.reference.messageId).catch(() => null)) ?? message;
    }

    // Structured Discord facts (not regex) — handed to the model as context.
    const mentioned = client.user ? message.mentions.has(client.user.id) : false;
    // Reply-to-bot works even when the reply ping is OFF: check the referenced
    // message's author, falling back to the pinged-reply signal.
    const repliedToBot =
      !!client.user &&
      ((!!message.reference?.messageId && modTarget !== message && modTarget.author?.id === client.user.id) ||
        message.mentions.repliedUser?.id === client.user.id);
    const isDM = !message.guild;
    const addressed = mentioned || repliedToBot || isDM;

    // Nothing to work with — but a bare "@aigarth" (addressed, no text) is a real
    // ping and should get a response, not silence.
    if (!content && message.attachments.size === 0 && !addressed) return;

    // Per-user cooldown is a cost/abuse guard for UNADDRESSED chatter only — a direct
    // mention / reply-to-bot / DM must never be dropped for asking a fast follow-up.
    if (!addressed && !passCooldown(message.author.id)) {
      log.debug("cooldown skip", { user: message.author.id });
      return;
    }
    // Per-channel flood ceiling still applies to everyone (runaway-loop protection).
    if (!canSend(message.channelId)) {
      log.warn("per-channel reply ceiling hit; skipping", { channel: message.channelId });
      return;
    }

    // Burst coalescing: a person often types a thought across several messages. Wait
    // a beat; if they send another in the meantime, drop this turn and let the newer
    // one respond — by then the whole burst is already in history. (All messages are
    // stored above, so nothing is lost.) Turns otherwise run independently — we do NOT
    // serialize per channel: a single slow turn must never block the rest of the room.
    const burstKey = `${message.channelId}:${message.author.id}`;
    burstLatest.set(burstKey, message.id);
    if (config.burstDebounceMs > 0) {
      await new Promise((r) => setTimeout(r, config.burstDebounceMs));
      if (burstLatest.get(burstKey) !== message.id) {
        log.debug("superseded by newer message in burst", { channel: message.channelId });
        return;
      }
    }

    // "typing…" heartbeat — shown ONLY while he's actively working toward a reply
    // (a slow tool like image gen is running) or about to post, never up front and
    // never when he'll just react or stay silent. Discord clears the indicator after
    // ~10s, so we re-send on an interval to keep it alive across long work, and stop
    // it when the turn ends. Idempotent: re-calling start just retargets the channel.
    const startTyping = (channel: any): void => {
      typingChannel = channel;
      const tick = () => {
        if (typingChannel && "sendTyping" in typingChannel) typingChannel.sendTyping().catch(() => {});
      };
      if (typingTimer) return; // already beating
      tick();
      typingTimer = setInterval(tick, 8000);
    };
    // Tools that are NOT "working toward a reply" — they shouldn't trigger typing.
    // (reply/thread handle their own typing at the post site; react/polls/status/
    // memory are either not a message or instant background writes.)
    const NO_TYPING = new Set([
      "react",
      "reply",
      "reply_in_thread",
      "start_ban_poll",
      "start_delete_poll",
      "set_channel_status",
      "remember",
      "recall",
    ]);

    // ── Per-turn Discord surface: the side effects the model's tools drive. ──
    const pendingImages: string[] = []; // images skills produced, awaiting a reply to attach to
    let firstReplySent = false;
    let sentAnything = false;

    const postText = async (text: string): Promise<void> => {
      const clean = stripImageMarkdown(text ?? "");
      const files = pendingImages.length ? await fetchAttachments(pendingImages.splice(0)) : [];
      const parts = chunk(clean);
      if (parts.length === 0 && files.length === 0) return;
      if (!firstReplySent) {
        startTyping(message.channel); // he intends to respond → typing until it posts
        await message.reply({ content: parts[0] || undefined, files, allowedMentions: SAFE_MENTIONS });
        firstReplySent = true;
      } else {
        await message.channel.send({ content: parts[0] || undefined, files, allowedMentions: SAFE_MENTIONS });
      }
      for (const p of parts.slice(1)) await message.channel.send({ content: p, allowedMentions: SAFE_MENTIONS });
      recordBotSend(message.channelId);
      sentAnything = true;
      if (inTracked && clean) {
        messages.add(message.channelId, config.botName, clean, client.user?.id ?? null, true);
      }
    };

    const actions: DiscordActions = {
      reply: postText,
      react: async (emoji: string) => {
        await modTarget.react(emoji);
        recordBotSend(message.channelId);
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
          if (!thread) return postText(text); // can't thread here → inline
          const parts = chunk(stripImageMarkdown(text));
          const files = pendingImages.length ? await fetchAttachments(pendingImages.splice(0)) : [];
          startTyping(thread); // intends to respond (in-thread) → typing until it posts
          await thread.send({ content: parts[0] || undefined, files, allowedMentions: SAFE_MENTIONS });
          for (const p of parts.slice(1)) await thread.send({ content: p, allowedMentions: SAFE_MENTIONS });
          recordBotSend(message.channelId);
          sentAnything = true;
          if (inTracked && text) messages.add(message.channelId, config.botName, text, client.user?.id ?? null, true);
        } catch (e) {
          log.debug("thread reply failed; replying inline", { err: String(e) });
          await postText(text);
        }
      },
      startBanPoll: async (reason: string) => {
        if (!message.guild) return;
        await openModerationVote({
          channel: message.channel,
          guildId: message.guild.id,
          targetUserId: modTarget.author.id,
          action: "ban",
          reason,
          evidence: modTarget.content,
          targetMsgId: modTarget.id,
        });
        sentAnything = true;
      },
      startDeletePoll: async (reason: string) => {
        if (!message.guild) return;
        await openModerationVote({
          channel: message.channel,
          guildId: message.guild.id,
          targetUserId: modTarget.author.id,
          action: "delete",
          reason,
          evidence: modTarget.content,
          targetMsgId: modTarget.id,
        });
        sentAnything = true;
      },
      canModerate: !!message.guild,
    };

    const imageUrls = [...message.attachments.values()]
      .filter((a) => (a.contentType ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(a.name ?? ""))
      .map((a) => a.url);

    log.info("running turn", { ch: message.channelId, addressed, len: content.length });
    const result = await runTurn({
      channelId: message.channelId,
      channelName: ("name" in message.channel ? (message.channel as any).name : undefined) ?? "DM",
      userId: message.author.id,
      userName: message.author.displayName ?? message.author.username,
      text: content || "(they pinged you with no other text)",
      imageUrls,
      history: priorHistory,
      chattiness: settings.getChattiness(),
      mentioned,
      repliedToBot,
      isDM,
      spokeRecently: botSpokeRecently(message.channelId),
      actions,
      onImage: (u) => pendingImages.push(u),
      onToolStart: (tool) => {
        // Slow, user-facing work (image gen, doc/web reads, charts…) → show typing.
        if (!NO_TYPING.has(tool)) startTyping(message.channel);
      },
    });

    // Leftover images (a skill produced one but the model never called reply).
    if (pendingImages.length) await postText("");

    // Safety net: clearly addressed but the model wrote text without calling reply
    // → don't drop the answer. (For UNaddressed turns we respect the silence.)
    if (!sentAnything && (mentioned || repliedToBot || isDM) && result.finalText) {
      await postText(result.finalText);
    }
    log.info("turn done", { ch: message.channelId, sent: sentAnything, error: result.error });
    if (!sentAnything && result.error) {
      // A bad turn is just silence (no apology spam); the failure is in the logs.
      log.warn("turn errored; staying silent", { channel: message.channelId });
    }
  } catch (err) {
    log.error("message handler error", { err: String(err) });
  } finally {
    // Never leave a "typing…" indicator beating past the turn.
    if (typingTimer) clearInterval(typingTimer);
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
