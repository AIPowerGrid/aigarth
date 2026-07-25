import type { Client, Message } from "discord.js";
import { config } from "../config.js";
import { messages, redactStoredContent, type StoredMessage } from "../store/db.js";
import { log } from "../util/log.js";
import { renderMentions } from "./render.js";

const MAX_EMBED_TEXT = 500;
const MAX_REPLY_PREVIEW = 180;

export interface RoomMessage {
  id: string;
  authorName: string;
  authorId: string | null;
  isBot: boolean;
  isSelf: boolean;
  content: string;
  createdTimestamp: number;
  replyTo?: {
    messageId: string;
    authorName?: string;
    preview?: string;
  };
  attachments?: string[];
  embeds?: string[];
  reactions?: string[];
  stickers?: string[];
}

export interface RoomContext {
  /** Current visible transcript, oldest to newest, with [FOCUS]/[NOW] markers. */
  transcript: string;
  /** Discord message ID at the visible end of the room. */
  latestMessageId: string | null;
  focusIsLatest: boolean;
  messagesAfterFocus: number;
  visibleCount: number;
  source: "discord" | "local";
  roomDescription?: string;
}

function oneLine(value: string, max = 400): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function timestamp(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + "Z";
}

function payload(message: RoomMessage): string {
  const pieces = [message.content.trim()];
  if (message.attachments?.length) pieces.push(`[attachments: ${message.attachments.join("; ")}]`);
  if (message.embeds?.length) pieces.push(`[embeds: ${message.embeds.join("; ")}]`);
  if (message.stickers?.length) pieces.push(`[stickers: ${message.stickers.join(", ")}]`);
  if (message.reactions?.length) pieces.push(`[reactions: ${message.reactions.join(", ")}]`);
  return pieces.filter(Boolean).join(" ") || "(no text)";
}

function formatRoomMessage(message: RoomMessage, focusId: string, latestId: string): string {
  const markers = [
    message.id === focusId ? "[FOCUS]" : "",
    message.id === latestId ? "[NOW]" : "",
  ].filter(Boolean).join("");
  const identity = message.isSelf
    ? `${message.authorName} (you)`
    : message.isBot
      ? `${message.authorName} (bot)`
      : message.authorName;
  const reply = message.replyTo
    ? ` [replying to ${message.replyTo.authorName ?? "an earlier message"}${
        message.replyTo.preview ? `: "${oneLine(message.replyTo.preview, MAX_REPLY_PREVIEW)}"` : ""
      }]`
    : "";
  return `${markers}[${timestamp(message.createdTimestamp)}] ${identity}${reply}: ${payload(message)}`;
}

/**
 * Build the bounded room transcript. The newest messages win the character
 * budget, but the focus message is retained so the judge always knows what
 * triggered its attention.
 */
export function formatRoomContext(
  input: RoomMessage[],
  focusId: string,
  maxChars: number,
  source: RoomContext["source"],
  roomDescription?: string,
): RoomContext {
  const byId = new Map<string, RoomMessage>();
  for (const message of input) byId.set(message.id, message);
  const ordered = [...byId.values()].sort((a, b) =>
    a.createdTimestamp === b.createdTimestamp
      ? a.id.localeCompare(b.id)
      : a.createdTimestamp - b.createdTimestamp,
  );
  const latestId = ordered.at(-1)?.id ?? focusId;
  const focusIndex = ordered.findIndex((message) => message.id === focusId);
  const messagesAfterFocus = focusIndex < 0 ? 0 : ordered.length - focusIndex - 1;

  const selected: RoomMessage[] = [];
  let chars = 0;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const line = formatRoomMessage(ordered[i], focusId, latestId);
    if (selected.length > 0 && chars + line.length + 1 > maxChars) break;
    selected.push(ordered[i]);
    chars += line.length + 1;
  }
  selected.reverse();

  const focus = byId.get(focusId);
  if (focus && !selected.some((message) => message.id === focusId)) {
    selected.unshift(focus);
  }

  return {
    transcript: selected.map((message) => formatRoomMessage(message, focusId, latestId)).join("\n"),
    latestMessageId: latestId || null,
    focusIsLatest: latestId === focusId,
    messagesAfterFocus,
    visibleCount: ordered.length,
    source,
    roomDescription,
  };
}

function authorName(message: Message): string {
  return message.member?.displayName ?? message.author.displayName ?? message.author.username;
}

function describeAttachment(attachment: Message["attachments"] extends Map<any, infer V> ? V : never): string {
  const item = attachment as any;
  const kind = String(item.contentType ?? "").startsWith("image/")
    ? "image"
    : String(item.contentType ?? "").startsWith("video/")
      ? "video"
      : String(item.contentType ?? "").startsWith("audio/")
        ? "audio"
        : "file";
  const size = Number.isFinite(item.size) ? `${Math.max(1, Math.round(item.size / 1024))}KB` : "";
  const url = kind === "image" || kind === "video" ? ` ${item.url}` : "";
  return oneLine(`${kind} ${item.name ?? "attachment"} ${size}${url}`, 700);
}

function describeEmbed(embed: Message["embeds"][number]): string {
  const e = embed as any;
  return oneLine(
    [e.author?.name, e.title, e.description, e.url].filter((value) => typeof value === "string").join(" — "),
    MAX_EMBED_TEXT,
  );
}

function roomDescription(message: Message): string | undefined {
  const channel = message.channel as any;
  const bits = [
    typeof channel.name === "string" ? `#${channel.name}` : "direct message",
    typeof channel.topic === "string" && channel.topic.trim() ? `topic: ${oneLine(channel.topic, 500)}` : "",
    channel.parent?.name ? `category: ${oneLine(channel.parent.name, 100)}` : "",
  ].filter(Boolean);
  return bits.join("; ") || undefined;
}

function fromDiscord(client: Client, message: Message, all: Map<string, Message>): RoomMessage {
  const referenceId = message.reference?.messageId ?? undefined;
  const referenced = referenceId ? all.get(referenceId) : undefined;
  const reactions = [...message.reactions.cache.values()]
    .filter((reaction) => reaction.count > 0)
    .map((reaction) => `${reaction.emoji.toString()}×${reaction.count}`)
    .slice(0, 12);

  return {
    id: message.id,
    authorName: authorName(message),
    authorId: message.author.id,
    isBot: message.author.bot,
    isSelf: message.author.id === client.user?.id,
    content: renderMentions(client, message),
    createdTimestamp: message.createdTimestamp,
    replyTo: referenceId
      ? {
          messageId: referenceId,
          authorName: referenced ? authorName(referenced) : undefined,
          preview: referenced ? payload(fromDiscordShallow(client, referenced)) : undefined,
        }
      : undefined,
    attachments: [...message.attachments.values()].map(describeAttachment).slice(0, 10),
    embeds: message.embeds.map(describeEmbed).filter(Boolean).slice(0, 5),
    reactions,
    stickers: [...message.stickers.values()].map((sticker) => sticker.name).slice(0, 10),
  };
}

function fromDiscordShallow(client: Client, message: Message): RoomMessage {
  return {
    id: message.id,
    authorName: authorName(message),
    authorId: message.author.id,
    isBot: message.author.bot,
    isSelf: message.author.id === client.user?.id,
    content: renderMentions(client, message),
    createdTimestamp: message.createdTimestamp,
    attachments: [...message.attachments.values()].map(describeAttachment).slice(0, 3),
    embeds: message.embeds.map(describeEmbed).filter(Boolean).slice(0, 2),
    stickers: [...message.stickers.values()].map((sticker) => sticker.name).slice(0, 3),
  };
}

function fromStored(row: StoredMessage): RoomMessage {
  return {
    id: row.message_id ?? `local-${row.id}`,
    authorName: row.author_name,
    authorId: row.author_id,
    isBot: !!row.is_bot || row.author_name.endsWith(" (bot)"),
    isSelf: !!row.is_bot,
    content: row.content,
    createdTimestamp: row.ts,
  };
}

function persistVisible(message: RoomMessage, channelId: string): void {
  const storedAuthor = message.isBot && !message.isSelf
    ? `${message.authorName} (bot)`
    : message.authorName;
  messages.sync(
    channelId,
    storedAuthor,
    payload(message),
    message.authorId,
    message.isSelf,
    message.id,
    message.createdTimestamp,
  );
}

/**
 * Synchronize what Discord currently shows before asking the participation
 * judge. Falls back to the durable local transcript if Discord history cannot
 * be fetched (permissions, transient API failure, or an unsupported channel).
 */
export async function getRoomContext(
  client: Client,
  focus: Message,
  opts: { limit?: number; maxChars?: number; persist?: boolean } = {},
): Promise<RoomContext> {
  const limit = Math.max(1, Math.min(100, opts.limit ?? config.discordContextLimit));
  const maxChars = Math.max(1000, opts.maxChars ?? config.historyMaxChars);
  try {
    if (!("messages" in focus.channel)) throw new Error("channel does not expose message history");
    const fetched = await focus.channel.messages.fetch({ limit });
    const all = new Map<string, Message>();
    for (const message of fetched.values()) all.set(message.id, message);
    all.set(focus.id, focus);

    if (focus.reference?.messageId && !all.has(focus.reference.messageId)) {
      const referenced = await focus.fetchReference().catch(() => null);
      if (referenced) all.set(referenced.id, referenced);
    }

    const visible = [...all.values()].map((message) => fromDiscord(client, message, all));
    if (opts.persist !== false) {
      for (const message of visible) persistVisible(message, focus.channelId);
    }
    return formatRoomContext(visible, focus.id, maxChars, "discord", roomDescription(focus));
  } catch (error) {
    log.debug("live Discord context unavailable; using local transcript", {
      channel: focus.channelId,
      err: String(error),
    });
    const local = messages.recent(focus.channelId, limit).map(fromStored);
    if (!local.some((message) => message.id === focus.id)) {
      local.push({
        id: focus.id,
        authorName: authorName(focus),
        authorId: focus.author.id,
        isBot: focus.author.bot,
        isSelf: focus.author.id === client.user?.id,
        content: redactStoredContent(renderMentions(client, focus)),
        createdTimestamp: focus.createdTimestamp,
      });
    }
    return formatRoomContext(local, focus.id, maxChars, "local", roomDescription(focus));
  }
}
