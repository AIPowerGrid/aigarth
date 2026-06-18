import { type Message, EmbedBuilder } from "discord.js";
import { config, isAdmin } from "../config.js";
import { settings } from "../store/db.js";
import { getMemory } from "../memory.js";
import { listDocs, saveDoc, deleteDoc } from "../docs/store.js";

/**
 * Slash-free `!` commands (the bot is conversational; commands are for admin
 * ops + help). Image gen is NOT a command anymore — it's a skill the model
 * calls. Doc management forwards to the Python retrieval service.
 *
 * Returns true if the message was a command (handled), false otherwise.
 */
export async function handleCommand(message: Message): Promise<boolean> {
  const content = message.content.trim();
  if (!content.startsWith("!")) return false;
  const [cmd, ...rest] = content.slice(1).split(/\s+/);
  const arg = rest.join(" ");
  const admin = isAdmin(message.author.id);

  switch (cmd.toLowerCase()) {
    case "help":
      await message.reply({ embeds: [helpEmbed(admin)] });
      return true;

    case "chattiness": {
      if (!admin) return true;
      if (!arg) {
        await message.reply(`🗣️ chattiness is **${settings.getChattiness()}/10**`);
        return true;
      }
      const n = parseInt(arg, 10);
      if (!Number.isFinite(n) || n < 1 || n > 10) {
        await message.reply("usage: `!chattiness <1-10>`");
        return true;
      }
      settings.set("chattiness_level", String(n));
      await message.reply(`✅ chattiness set to **${n}/10**`);
      return true;
    }

    case "remember": {
      if (!admin) return true;
      if (!arg) {
        await message.reply("usage: `!remember <fact>`");
        return true;
      }
      const mem = await getMemory();
      if (!mem.enabled) {
        await message.reply("memory isn't configured.");
        return true;
      }
      await mem.remember(arg, { tags: ["admin", "fact"], context: "taught by admin" });
      await message.reply("🧠 noted.");
      return true;
    }

    case "upload": {
      if (!admin) return true;
      await handleUpload(message);
      return true;
    }
    case "list": {
      if (!admin) return true;
      await docList(message);
      return true;
    }
    case "delete": {
      if (!admin) return true;
      if (!arg) {
        await message.reply("usage: `!delete <filename>`");
        return true;
      }
      await docDelete(message, arg);
      return true;
    }

    default:
      return true; // it started with ! — swallow unknown commands silently
  }
}

function helpEmbed(admin: boolean): EmbedBuilder {
  const e = new EmbedBuilder()
    .setTitle(`${config.botName}`)
    .setColor(0x33cc77)
    .setDescription(
      "I'm the AI Power Grid community agent — and I run *on* the Grid. " +
        "Mention me or say my name. I can answer questions (I search the docs), " +
        "generate images, check crypto prices, and remember things.",
    )
    .addFields({
      name: "Try",
      value:
        "• `@me what's AIPG's reward model?`\n" +
        "• `@me draw a neon power grid, flux, landscape`\n" +
        "• `@me price of ai-power-grid`",
    });
  if (admin) {
    e.addFields({
      name: "Admin",
      value:
        "`!chattiness <1-10>` · `!remember <fact>` · `!upload` (attach .md/.txt) · " +
        "`!list` · `!delete <file>`",
    });
  }
  return e;
}

// ── doc management → markdown files (agentic retrieval, no vector RAG) ─────
async function handleUpload(message: Message): Promise<void> {
  const atts = [...message.attachments.values()];
  if (atts.length === 0) {
    await message.reply("attach a .md/.txt file to add to my docs.");
    return;
  }
  const results: string[] = [];
  for (const a of atts) {
    const ext = a.name?.split(".").pop()?.toLowerCase() ?? "";
    if (!["txt", "md", "mdx"].includes(ext)) {
      results.push(`❌ ${a.name}: unsupported type`);
      continue;
    }
    try {
      const text = await (await fetch(a.url)).text();
      const name = (a.name ?? "doc.md").replace(/\.(txt|mdx)$/i, ".md");
      const saved = saveDoc(name, text);
      results.push(`✅ ${saved}`);
    } catch (e) {
      results.push(`❌ ${a.name}: ${e}`);
    }
  }
  await message.reply(results.join("\n"));
}

async function docList(message: Message): Promise<void> {
  const docs = listDocs();
  await message.reply(docs.length ? `📄 ${docs.map((d) => d.name).join(", ")}` : "no docs.");
}

async function docDelete(message: Message, filename: string): Promise<void> {
  const ok = deleteDoc(filename);
  await message.reply(ok ? `🗑️ deleted ${filename}` : `no doc named ${filename}`);
}
