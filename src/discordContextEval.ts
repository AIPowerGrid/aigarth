/**
 * Read-only live Discord context integration check.
 *
 * Uses a disposable STATE_DB_PATH, logs no message content, and never posts.
 * It proves that the bot can see and durably synchronize the same room details
 * a human participant sees before the engagement judge runs.
 */
import {
  Client,
  GatewayIntentBits,
  Partials,
  type Message,
} from "discord.js";
import { config } from "./config.js";
import { getRoomContext } from "./discord/context.js";
import { messages } from "./store/db.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

async function main(): Promise<void> {
  await client.login(config.discordToken);
  const channelIds = [...new Set([...config.channels, ...config.readonlyChannels])];
  if (channelIds.length === 0) throw new Error("No BOT_CHANNELS or BOT_READONLY_CHANNELS configured");

  for (const channelId of channelIds) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !("messages" in channel)) continue;
    const fetched = await channel.messages.fetch({ limit: config.discordContextLimit });
    const focus = [...fetched.values()].find((message) => !message.author.bot) as Message | undefined;
    if (!focus) continue;

    const first = await getRoomContext(client, focus, {
      limit: config.discordContextLimit,
      maxChars: config.historyMaxChars,
      persist: true,
    });
    const firstRows = messages.recent(channelId, 100).length;
    const second = await getRoomContext(client, focus, {
      limit: config.discordContextLimit,
      maxChars: config.historyMaxChars,
      persist: true,
    });
    const secondRows = messages.recent(channelId, 100).length;
    const visible = [...fetched.values()];
    const stats = {
      bots: visible.filter((message) => message.author.bot).length,
      replies: visible.filter((message) => !!message.reference?.messageId).length,
      attachments: visible.reduce((count, message) => count + message.attachments.size, 0),
      embeds: visible.reduce((count, message) => count + message.embeds.length, 0),
      reactions: visible.reduce((count, message) => count + message.reactions.cache.size, 0),
      stickers: visible.reduce((count, message) => count + message.stickers.size, 0),
    };
    const checks = {
      discordSource: first.source === "discord" && second.source === "discord",
      focusMarker: first.transcript.includes("[FOCUS]"),
      nowMarker: first.transcript.includes("[NOW]"),
      roomDescription: !!first.roomDescription,
      stableVisibleCount: first.visibleCount === second.visibleCount,
      noSyncDuplicates: firstRows === secondRows,
    };
    console.log(JSON.stringify({
      channelId,
      fetched: fetched.size,
      visibleCount: first.visibleCount,
      persistedRows: secondRows,
      focusIsLatest: first.focusIsLatest,
      messagesAfterFocus: first.messagesAfterFocus,
      metadata: stats,
      checks,
    }, null, 2));
    if (!Object.values(checks).every(Boolean)) {
      throw new Error("live Discord context integration check failed");
    }
    return;
  }
  throw new Error("No configured text channel contained a human message");
}

try {
  await main();
} finally {
  client.destroy();
}
