import { AttachmentBuilder, type Client, type Message } from "discord.js";
import { log } from "../util/log.js";

/** Replace Discord mention/emoji markup with readable names so the model — and the
 *  stored transcript — see "@alice", "#general", ":smile:" instead of raw <@123…>
 *  ids. With `stripBot`, the bot's own mention is removed entirely (so an addressed
 *  message reads as the bare request, not "@aigarth hey"). */
export function renderMentions(client: Client, message: Message, opts: { stripBot?: boolean } = {}): string {
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

/** Download image URLs (from generate_image/crypto_chart etc.) into Discord
 *  attachments, naming each by its REAL content-type so it embeds correctly. */
export async function fetchAttachments(urls: string[]): Promise<AttachmentBuilder[]> {
  const files: AttachmentBuilder[] = [];
  for (let i = 0; i < urls.length; i++) {
    try {
      const res = await fetch(urls[i]);
      if (!res.ok) {
        log.warn("image download failed (not posting)", { status: res.status, url: urls[i].slice(0, 80) });
        continue;
      }
      const ct = res.headers.get("content-type") ?? "";
      const ext = ct.includes("png") ? "png" : ct.includes("jpeg") ? "jpg" : ct.includes("gif") ? "gif" : "webp";
      files.push(new AttachmentBuilder(Buffer.from(await res.arrayBuffer()), { name: `aigarth_${i + 1}.${ext}` }));
    } catch (e) {
      log.error("attachment fetch failed", { err: String(e) });
    }
  }
  return files;
}
