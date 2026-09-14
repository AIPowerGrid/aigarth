import { ActivityType, type Client, type MessageMentionOptions } from "discord.js";
import { config } from "../config.js";
import { log } from "../util/log.js";
import { channelSummaries, messages, settings, reminders } from "../store/db.js";
import { canSend, recordBotSend, botSpokeRecently } from "./gating.js";
import { openModerationVote } from "./scam.js";
import { runTurn } from "../agent.js";
import type { DiscordActions } from "../skills/discordActions.js";
import type { Activity } from "./coalescer.js";
import { stripImageMarkdown, chunk } from "./text.js";
import { fetchAttachments } from "./render.js";
import { maybeExtractUserFacts } from "../memoryExtraction.js";
import { maybeRefreshChannelSummary } from "../conversationSummary.js";
import { getRoomContext } from "./context.js";
import { renderMentions } from "./render.js";
import { redactStoredContent } from "../store/db.js";

// Bot messages never ping: no reply ping, no @everyone/@here/role pings (the model
// speaks in plain text and addresses people by name, like a person would).
const SAFE_MENTIONS: MessageMentionOptions = { parse: [], repliedUser: false };

/**
 * Fresh context -> one participant -> explicitly chosen public output.
 * The per-channel queue owns serialization, not participation decisions.
 */
export async function processActivity(client: Client, act: Activity): Promise<void> {
  const channelId = act.message.channelId;
  const message = act.message;
  const modTarget = act.modTarget;
  const inTracked = act.inTracked;
  // Immutable before any Discord fetch or Grid call. A flash deletion must not
  // erase or retarget the evidence while the model is deciding.
  const focusModerationSnapshot = {
    userId: message.author.id,
    messageId: message.id,
    evidence: message.content || act.content,
  };
  const requestedModerationSnapshot = {
    userId: modTarget.author.id,
    messageId: modTarget.id,
    evidence: modTarget.content,
  };
  let typingTimer: ReturnType<typeof setInterval> | null = null;
  let typingChannel: any = null;

  try {
    let room = await getRoomContext(client, message, {
      limit: config.discordContextLimit,
      maxChars: config.historyMaxChars,
      persist: inTracked,
    });
    const roomHasChanged = (): boolean =>
      !!room.latestMessageId &&
      (message.channel as any).lastMessageId !== room.latestMessageId;
    const requireCurrentRoom = (): void => {
      if (!act.respondable) throw new Error("Conversation output unavailable in this channel");
      if (!canSend(channelId)) throw new Error("Discord output rate limit reached");
      if (roomHasChanged()) throw new Error("Discord room changed while composing");
    };
    const history = room.transcript;
    const channelSummary = channelSummaries.get(channelId)?.summary ?? "";

    // Read-only channels restrict permissions, not model participation judgment.
    const moderationReview = !act.respondable;

    const startTyping = (channel: any): void => {
      typingChannel = channel;
      const tick = () => {
        if (typingChannel && "sendTyping" in typingChannel) typingChannel.sendTyping().catch(() => {});
      };
      if (typingTimer) return;
      tick();
      typingTimer = setInterval(tick, 8000);
    };

    const pendingImages: string[] = [];
    let firstReplySent = false;
    let sentAnything = false; // any output (incl. react) — for the turn-done log
    let postedMessage = false;

    const rememberSent = (sent: any, fallback: string): void => {
      recordBotSend(channelId);
      if (!inTracked || !sent?.id) return;
      messages.sync(
        channelId,
        config.botName,
        sent.content || fallback || "[image attachment]",
        client.user?.id ?? null,
        true,
        sent.id,
        sent.createdTimestamp ?? Date.now(),
      );
      void maybeRefreshChannelSummary(channelId);
    };

    const postText = async (text: string): Promise<void> => {
      requireCurrentRoom();
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
        const sent = stillCurrent
          ? await message.reply(payload)
          : await message.channel.send(payload);
        rememberSent(sent, parts[0] ?? "");
        firstReplySent = true;
      } else {
        const sent = await message.channel.send({
          content: parts[0] || undefined,
          files,
          allowedMentions: SAFE_MENTIONS,
        });
        rememberSent(sent, parts[0] ?? "");
      }
      for (const p of parts.slice(1)) {
        const sent = await message.channel.send({ content: p, allowedMentions: SAFE_MENTIONS });
        rememberSent(sent, p);
      }
      sentAnything = true;
      postedMessage = true;
    };

    const postThreadText = async (text: string, threadName?: string): Promise<void> => {
      requireCurrentRoom();
      try {
        let thread = message.thread ?? null;
        if (!thread && typeof (message as any).startThread === "function") {
          thread = await (message as any).startThread({
            name: (threadName || `chat with ${message.author.displayName ?? message.author.username}`).slice(0, 90),
          });
        }
        if (!thread) {
          await postText(text);
          return;
        }
        const parts = chunk(stripImageMarkdown(text));
        const files = pendingImages.length ? await fetchAttachments(pendingImages.splice(0)) : [];
        if (parts.length === 0 && files.length === 0) return;
        startTyping(thread);
        const first = await thread.send({
          content: parts[0] || undefined,
          files,
          allowedMentions: SAFE_MENTIONS,
        });
        rememberSent(first, parts[0] ?? "");
        for (const part of parts.slice(1)) {
          const sent = await thread.send({ content: part, allowedMentions: SAFE_MENTIONS });
          rememberSent(sent, part);
        }
        sentAnything = true;
        postedMessage = true;
      } catch (error) {
        log.debug("thread reply failed; replying inline", { err: String(error) });
        await postText(text);
      }
    };

    const actions: DiscordActions = {
      reply: postText,
      react: async (emoji: string) => {
        requireCurrentRoom();
        await message.react(emoji);
        recordBotSend(channelId);
        sentAnything = true;
      },
      replyInThread: async (text: string, threadName?: string) => {
        // Delivery is intentionally deferred. runTurn captures this tool's
        // draft/name, edits the text, and returns the requested destination.
        requireCurrentRoom();
        void text;
        void threadName;
      },
      startBanPoll: async (reason: string, target = "focus") => {
        const moderationTarget = target === "reply" ? requestedModerationSnapshot : focusModerationSnapshot;
        if (!message.guild) return;
        await openModerationVote({
          channel: message.channel, guildId: message.guild.id, targetUserId: moderationTarget.userId,
          action: "ban", reason, evidence: moderationTarget.evidence, targetMsgId: moderationTarget.messageId,
        });
        sentAnything = true;
      },
      startDeletePoll: async (reason: string, target = "focus") => {
        const moderationTarget = target === "reply" ? requestedModerationSnapshot : focusModerationSnapshot;
        if (!message.guild) return;
        await openModerationVote({
          channel: message.channel, guildId: message.guild.id, targetUserId: moderationTarget.userId,
          action: "delete", reason, evidence: moderationTarget.evidence, targetMsgId: moderationTarget.messageId,
        });
        sentAnything = true;
      },
      canModerate: !!message.guild,
      inGuild: !!message.guild,
      snooze: () => { throw new Error("Snooze tool is retired; the model decides silence each turn"); },
      setNickname: async (name: string) => {
        requireCurrentRoom();
        const clean = name.replace(/[@`]/g, "").slice(0, 32).trim();
        const me = message.guild?.members?.me;
        if (!me) return "can't change nickname here";
        await me.setNickname(clean || null);
        return clean ? `nickname set to ${clean}` : "nickname reset";
      },
      setPresence: async (text: string) => {
        requireCurrentRoom();
        const t = text.replace(/@/g, "").slice(0, 80).trim();
        if (!client.user) return;
        if (!t) client.user.setActivity();
        else client.user.setActivity({ name: t, type: ActivityType.Custom, state: t });
      },
      createPoll: async (question: string, options: string[], hours: number) => {
        requireCurrentRoom();
        await message.channel.send({
          poll: {
            question: { text: question.slice(0, 300) },
            answers: options.slice(0, 10).map((o) => ({ text: o.slice(0, 55) })),
            duration: Math.max(1, Math.min(768, Math.round(hours || 24))),
            allowMultiselect: false,
          },
          allowedMentions: SAFE_MENTIONS,
        });
        recordBotSend(channelId);
        sentAnything = true;
      },
      remind: async (text: string, minutes: number) => {
        requireCurrentRoom();
        reminders.add(channelId, message.author.id, text.slice(0, 500), Date.now() + minutes * 60_000);
      },
    };

    const result = await runTurn({
            channelId,
            channelName: ("name" in message.channel ? (message.channel as any).name : undefined) ?? "DM",
            userId: message.author.id,
            userName: message.author.displayName ?? message.author.username,
            text: act.content || "(no text; see the focus message's visible metadata)",
            imageUrls: act.imageUrls,
            history,
            channelSummary,
            chattiness: settings.getChattiness(),
            mentioned: act.mentioned,
            repliedToBot: act.repliedToBot,
            named: act.named,
            isDM: act.isDM,
            focusIsLatest: room.focusIsLatest,
            messagesAfterFocus: room.messagesAfterFocus,
            roomDescription: room.roomDescription,
            spokeRecently: botSpokeRecently(channelId),
            moderationReview,
            deleted: act.deleted,
            actions,
            readHistory: async (before, limit = 30) => {
              const older = await message.channel.messages.fetch({ before, limit: Math.max(1, Math.min(limit, 50)) });
              const transcript = [...older.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp)
                .map(m => `[${m.id} ${new Date(m.createdTimestamp).toISOString()}] ${m.author.displayName ?? m.author.username}${m.author.id === client.user?.id ? " (you)" : ""}: ${renderMentions(client, m)}`)
                .join("\n");
              return redactStoredContent(transcript).slice(-config.historyMaxChars);
            },
            refreshContext: async () => {
              const fresh = await getRoomContext(client, message, {
                limit: config.discordContextLimit, maxChars: config.historyMaxChars, persist: inTracked,
              });
              const changed = fresh.transcript !== room.transcript;
              room = fresh;
              return changed ? fresh.transcript : undefined;
            },
            onImage: (u) => pendingImages.push(u),
          });

    // Moderation review is intentionally silent. Its only visible output is a
    // community poll opened through one of the bounded moderation tools.
    if (moderationReview) {
      log.info("moderation review done", {
        ch: channelId,
        pollOpened: sentAnything,
        error: result.error,
      });
      return;
    }

    if (result.error) return;
    // The same agent refreshed the room through finish_turn. A new event after
    // that snapshot will receive its own serialized turn; don't post a stale draft.
    if (roomHasChanged()) return;

    // Natural text IS the reply: post the model's message (attaching any generated
    // images) unless it already posted one (e.g. in a thread). A react-only turn
    // still gets the text — reacting doesn't replace an answer.
    if (!postedMessage && (result.finalText.trim() || pendingImages.length)) {
      if (result.delivery === "thread") {
        await postThreadText(result.finalText, result.threadName);
      } else {
        await postText(result.finalText);
      }
    }
    if (pendingImages.length) await postText(""); // leftover images nothing posted yet
    if (!result.error) {
      void maybeExtractUserFacts({
        userId: message.author.id,
        userName: message.author.displayName ?? message.author.username,
        latest: act.content,
      });
    }
    log.info("turn done", { ch: channelId, sent: sentAnything || postedMessage, error: result.error });
  } catch (err) {
    log.error("channel turn error", { err: String(err) });
  } finally {
    if (typingTimer) clearInterval(typingTimer);
  }
}
