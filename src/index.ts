import {
  Client,
  GatewayIntentBits,
  Events,
  AttachmentBuilder,
  Partials,
  type Message,
} from "discord.js";
import { config } from "./config.js";
import { log } from "./util/log.js";
import { messages, banVotes } from "./store/db.js";
import { decideEngagement, passCooldown, isCommand, canSend, recordBotSend } from "./discord/gating.js";
import { decideProactive } from "./discord/proactiveGate.js";
import { handleCommand } from "./discord/commands.js";
import { screenMessage, openBanVote, handleVoteReaction } from "./discord/scam.js";
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

function cleanMention(message: Message): string {
  let c = message.content;
  if (client.user) c = c.replaceAll(`<@${client.user.id}>`, "").replaceAll(`<@!${client.user.id}>`, "");
  return c.trim();
}

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;
    const inTracked = !message.guild || TRACKED.size === 0 || TRACKED.has(message.channelId);

    // Store history for tracked channels (active + readonly), for context.
    if (inTracked) {
      messages.add(message.channelId, message.author.displayName ?? message.author.username, message.content, message.author.id, false);
    }

    // Commands first.
    if (isCommand(message.content)) {
      await handleCommand(message);
      return;
    }

    // Deterministic scam screen (guild messages only). Fail-closed.
    if (message.guild && inTracked) {
      const verdict = screenMessage(message.content);
      if (verdict.flagged) {
        await openBanVote(message, verdict.reason);
        return;
      }
    }

    const engagement = decideEngagement(client, message);
    if (engagement === "skip") return;
    const addressed = engagement === "addressed";
    if (!passCooldown(message.author.id)) {
      log.debug("cooldown skip", { user: message.author.id });
      return;
    }
    // #4 hard backstop applies even to addressed messages.
    if (!canSend(message.channelId)) {
      log.warn("per-channel reply ceiling hit; skipping", { channel: message.channelId });
      return;
    }

    // #2 reply-aware reacting: react to the message being replied to, if any.
    let reactTarget: Message = message;
    if (message.reference?.messageId && "messages" in message.channel) {
      reactTarget =
        (await message.channel.messages.fetch(message.reference.messageId).catch(() => null)) ?? message;
    }

    // LLM gate: for unaddressed messages, let the model decide like a real
    // regular — respond, drop a quick emoji, or stay out. Addressed messages
    // skip the gate and always get a real reply.
    if (engagement === "candidate") {
      const decision = await decideProactive(
        cleanMention(message),
        messages.formatRecent(message.channelId, 8),
        message.author.displayName ?? message.author.username,
      );
      log.info("gate", { action: decision.action, emoji: decision.emoji, channel: message.channelId });
      if (decision.action === "ignore") return;
      if (decision.action === "react") {
        try {
          await reactTarget.react(decision.emoji || "👍");
          recordBotSend(message.channelId);
        } catch (e) {
          log.debug("react failed", { err: String(e) });
        }
        return;
      }
      // respond → fall through to the full agent
    }

    // A beat before the "typing…" indicator — a real person doesn't start typing
    // the instant your message lands.
    if (config.typingDelayMs > 0) await new Promise((r) => setTimeout(r, config.typingDelayMs));
    if ("sendTyping" in message.channel) await message.channel.sendTyping().catch(() => {});

    const imageUrls = [...message.attachments.values()]
      .filter((a) => (a.contentType ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(a.name ?? ""))
      .map((a) => a.url);

    const result = await runTurn({
      channelId: message.channelId,
      channelName: ("name" in message.channel ? (message.channel as any).name : undefined) ?? "DM",
      userId: message.author.id,
      userName: message.author.displayName ?? message.author.username,
      text: cleanMention(message),
      imageUrls,
      addressed,
      onReact: async (emoji: string) => {
        await reactTarget.react(emoji);
      },
    });

    const files = result.images.length > 0 ? await fetchAttachments(result.images) : [];

    if (!result.text && files.length === 0) {
      // Nothing to say (error, empty, or a deliberate stay-silent). Per the
      // user's directive: say NOTHING on failure — no apology, no "rephrase"
      // spam. A bad turn is just silence; the failure is in the logs.
      if (result.error) {
        log.warn("turn produced no output", { channel: message.channelId, addressed });
      }
      if (result.reacted) recordBotSend(message.channelId);
      return;
    }

    const parts = chunk(stripImageMarkdown(result.text));
    await message.reply({ content: parts[0] || undefined, files });
    for (const p of parts.slice(1)) await message.channel.send(p);
    recordBotSend(message.channelId); // feeds #3 self-throttle + #4 ceiling

    if (inTracked && result.text) {
      messages.add(message.channelId, config.botName, result.text, client.user?.id ?? null, true);
    }
  } catch (err) {
    log.error("message handler error", { err: String(err) });
    try {
      await message.reply("⚠️ something went wrong on my end.");
    } catch {
      /* ignore */
    }
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

client.login(config.discordToken);
