import { ActivityType, type Client, type MessageMentionOptions } from "discord.js";
import { config } from "../config.js";
import { log } from "../util/log.js";
import { channelSummaries, messages, settings, reminders } from "../store/db.js";
import { canSend, recordBotSend, botSpokeRecently, passCooldown } from "./gating.js";
import { openModerationVote } from "./scam.js";
import { decideEngagement, shouldUseFullAgent } from "./gate.js";
import { runTurn } from "../agent.js";
import type { DiscordActions } from "../skills/discordActions.js";
import type { Activity, Coalescer } from "./coalescer.js";
import { stripImageMarkdown, chunk } from "./text.js";
import { fetchAttachments } from "./render.js";
import { maybeExtractUserFacts } from "../memoryExtraction.js";
import { maybeRefreshChannelSummary } from "../conversationSummary.js";
import { getRoomContext } from "./context.js";

// Bot messages never ping: no reply ping, no @everyone/@here/role pings (the model
// speaks in plain text and addresses people by name, like a person would).
const SAFE_MENTIONS: MessageMentionOptions = { parse: [], repliedUser: false };

// Tools that are NOT "working toward a reply" — they shouldn't trigger the typing
// indicator (reply/thread handle their own; the rest are instant or non-message).
const NO_TYPING = new Set([
  "react", "reply", "reply_in_thread", "start_ban_poll", "start_delete_poll",
  "set_channel_status", "remember", "forget", "set_mood", "snooze", "set_chattiness",
]);

/**
 * Process one coalesced channel turn: the engagement judge for every message, then
 * the per-turn Discord surface + the full chat agent + posting on `respond`.
 * Called by the coalescer (which owns serialization/settle/snooze).
 */
export async function processActivity(client: Client, act: Activity, coalescer: Coalescer): Promise<void> {
  const channelId = act.message.channelId;
  const message = act.message;
  const modTarget = act.modTarget;
  const inTracked = act.inTracked;
  let typingTimer: ReturnType<typeof setInterval> | null = null;
  let typingChannel: any = null;

  try {
    if (!canSend(channelId)) {
      log.warn("per-channel reply ceiling hit; skipping", { channel: channelId });
      return;
    }
    if (!act.addressed && !passCooldown(message.author.id)) {
      log.debug("per-user attention cooldown; skipping", { channel: channelId, user: message.author.id });
      return;
    }

    const room = await getRoomContext(client, message, {
      limit: config.discordContextLimit,
      maxChars: config.historyMaxChars,
      persist: inTracked,
    });
    const roomHasChanged = (): boolean =>
      !!room.latestMessageId &&
      (message.channel as any).lastMessageId !== room.latestMessageId;
    const requireCurrentRoom = (): void => {
      if (roomHasChanged()) throw new Error("Discord room changed while composing");
    };
    const history = room.transcript;
    const channelSummary = channelSummaries.get(channelId)?.summary ?? "";

    const decision = await decideEngagement({
      history,
      summary: channelSummary,
      focus: act.content,
      focusUserName: message.author.displayName ?? message.author.username,
      focusIsLatest: room.focusIsLatest,
      messagesAfterFocus: room.messagesAfterFocus,
      roomDescription: room.roomDescription,
      recentlyEngaged: botSpokeRecently(channelId),
      chattiness: settings.getChattiness(),
      mentioned: act.mentioned,
      repliedToBot: act.repliedToBot,
      named: act.named,
      isDM: act.isDM,
      untrustedLink: act.untrustedLink,
    });
    const useFullAgent = shouldUseFullAgent(decision, act.content);
    log.info("gate", {
      ch: channelId, action: decision.action, emoji: decision.emoji,
      reason: decision.reason, error: decision.error, context: room.source,
      mode: decision.action === "respond" ? (useFullAgent ? "agent" : "plain") : undefined,
      focusIsLatest: room.focusIsLatest, newer: room.messagesAfterFocus,
      text: act.content.slice(0, 100),
    });
    if (decision.action === "react") {
      // A reaction is attached to one concrete message and cannot be made
      // current by sending it as a fresh channel post. Enforce the judge's
      // [FOCUS] == [NOW] rule mechanically.
      if (!room.focusIsLatest || roomHasChanged()) {
        log.debug("stale reaction suppressed", { ch: channelId });
        return;
      }
      try {
        await modTarget.react(decision.emoji || "👍");
        recordBotSend(channelId);
      } catch (e) {
        log.debug("react failed", { err: String(e) });
      }
      return;
    }
    if (decision.action === "ignore") return;

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
        await modTarget.react(emoji);
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
      startBanPoll: async (reason: string) => {
        if (!message.guild) return;
        requireCurrentRoom();
        await openModerationVote({
          channel: message.channel, guildId: message.guild.id, targetUserId: modTarget.author.id,
          action: "ban", reason, evidence: modTarget.content, targetMsgId: modTarget.id,
        });
        sentAnything = true;
      },
      startDeletePoll: async (reason: string) => {
        if (!message.guild) return;
        requireCurrentRoom();
        await openModerationVote({
          channel: message.channel, guildId: message.guild.id, targetUserId: modTarget.author.id,
          action: "delete", reason, evidence: modTarget.content, targetMsgId: modTarget.id,
        });
        sentAnything = true;
      },
      canModerate: !!message.guild,
      inGuild: !!message.guild,
      snooze: (minutes: number) => {
        requireCurrentRoom();
        coalescer.snooze(channelId, minutes * 60_000);
        log.info("snoozed channel", { ch: channelId, minutes });
      },
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

    const result =
      !useFullAgent && decision.reply
        ? { finalText: decision.reply, images: [], error: false, delivery: "channel" as const }
        : await runTurn({
            channelId,
            channelName: ("name" in message.channel ? (message.channel as any).name : undefined) ?? "DM",
            userId: message.author.id,
            userName: message.author.displayName ?? message.author.username,
            text: act.content || "(they pinged you with no other text)",
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
            actions,
            onImage: (u) => pendingImages.push(u),
            onToolStart: (tool) => {
              if (!NO_TYPING.has(tool)) startTyping(message.channel);
            },
          });

    // A 120B/tool turn can take long enough for the room to change. Never post a
    // response composed against stale state without letting the judge see the
    // new lines. An addressed focus that is still relevant is re-queued so the
    // next turn can compose from the refreshed room; otherwise it closes quietly.
    if (!postedMessage && roomHasChanged()) {
      const refreshed = await getRoomContext(client, message, {
        limit: config.discordContextLimit,
        maxChars: config.historyMaxChars,
        persist: inTracked,
      });
      const reconsidered = await decideEngagement({
        history: refreshed.transcript,
        summary: channelSummary,
        focus: act.content,
        focusUserName: message.author.displayName ?? message.author.username,
        focusIsLatest: refreshed.focusIsLatest,
        messagesAfterFocus: refreshed.messagesAfterFocus,
        roomDescription: refreshed.roomDescription,
        recentlyEngaged: botSpokeRecently(channelId),
        chattiness: settings.getChattiness(),
        mentioned: act.mentioned,
        repliedToBot: act.repliedToBot,
        named: act.named,
        isDM: act.isDM,
        untrustedLink: act.untrustedLink,
      });
      log.info("stale turn revalidated", {
        ch: channelId,
        action: reconsidered.action,
        reason: reconsidered.reason,
        newer: refreshed.messagesAfterFocus,
      });
      if (reconsidered.action === "respond" && act.addressed) {
        coalescer.noteActivity(act);
      }
      return;
    }

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
