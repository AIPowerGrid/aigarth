import { Client, GatewayIntentBits, Events, Partials, type Message } from "discord.js";
import { config } from "./config.js";
import { log } from "./util/log.js";
import { messages, banVotes, reminders } from "./store/db.js";
import { isCommand } from "./discord/gating.js";
import { handleCommand } from "./discord/commands.js";
import { screenMessage, hasUntrustedLink, openBanVote, handleVoteReaction } from "./discord/scam.js";
import { createCoalescer, type Coalescer } from "./discord/coalescer.js";
import { processActivity } from "./discord/turn.js";
import { renderMentions } from "./discord/render.js";
import { PROMPT_VERSION } from "./prompts.js";

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

// One attention per channel: the coalescer schedules a single turn per channel and
// hands it to processActivity (gate → agent → post). See discord/coalescer.ts.
let coalescer: Coalescer;
coalescer = createCoalescer({
  run: (act) => processActivity(client, act, coalescer),
  settleMs: config.convSettleMs,
  settleAddressedMs: config.convSettleAddressedMs,
});

client.once(Events.ClientReady, (c) => {
  log.info("aigarth online", { tag: c.user.tag, model: config.gridChatModel, prompts: PROMPT_VERSION });
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

// Ingestion: per-message bookkeeping (history, commands, scam, eligibility, signals),
// then hand the channel's current state to the coalescer.
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
    // context), then store it (mentions resolved to readable names).
    let priorHistory = "";
    if (inTracked) {
      priorHistory = messages.formatRecent(message.channelId, config.historyWindow);
      messages.add(message.channelId, message.author.displayName ?? message.author.username, renderMentions(client, message), message.author.id, false);
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

    const content = renderMentions(client, message, { stripBot: true });

    // Moderation/react/reply target: the replied-to message if this is a reply, else
    // the triggering message (so "@aigarth ban this" hits the offender, and we can
    // tell when someone is replying to the BOT even with the ping turned off).
    let modTarget: Message = message;
    if (message.reference?.messageId && "messages" in message.channel) {
      modTarget =
        (await message.channel.messages.fetch(message.reference.messageId).catch(() => null)) ?? message;
    }

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

    coalescer.noteActivity({
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
