/**
 * Agentic doc store — markdown files read directly, no vector RAG.
 *
 * For a small curated corpus this beats embeddings: the model gets the FULL doc
 * (no chunk truncation), it's debuggable (you see exactly what it read), and
 * there's no ChromaDB/embeddings service to run. The model picks a doc from the
 * injected index and reads it whole, or greps for an exact term.
 *
 * Docs live in aigarth-agent/docs/*.md (version-controlled). Resolved relative
 * to this compiled module so it works regardless of cwd.
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DOCS_DIR = fileURLToPath(new URL("../../docs", import.meta.url));
const RESERVED_DOCS = new Set(["agents.md"]);

function isKnowledgeDoc(name: string): boolean {
  return name.endsWith(".md") && !RESERVED_DOCS.has(name.toLowerCase());
}

function safeName(name: string): string {
  // Strip any path components + force .md — no traversal.
  const base = path.basename(String(name)).replace(/[^a-zA-Z0-9._-]/g, "");
  return base.endsWith(".md") ? base : `${base}.md`;
}

function firstHeading(md: string): string {
  for (const line of md.split("\n")) {
    const m = line.match(/^#{1,3}\s+(.+)/);
    if (m) return m[1].trim();
  }
  return "";
}

export function listDocs(): Array<{ name: string; title: string }> {
  if (!existsSync(DOCS_DIR)) return [];
  return readdirSync(DOCS_DIR)
    .filter(isKnowledgeDoc)
    .sort()
    .map((f) => {
      let title = "";
      try {
        title = firstHeading(readFileSync(path.join(DOCS_DIR, f), "utf-8"));
      } catch {
        /* ignore */
      }
      return { name: f, title };
    });
}

export function readDoc(name: string): string | null {
  const safe = safeName(name);
  if (!isKnowledgeDoc(safe)) return null;
  const file = path.join(DOCS_DIR, safe);
  if (!existsSync(file)) return null;
  try {
    return readFileSync(file, "utf-8");
  } catch {
    return null;
  }
}

export interface GrepHit {
  doc: string;
  line: number;
  text: string;
}

export function grepDocs(query: string, maxHits = 30): GrepHit[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const hits: GrepHit[] = [];
  for (const { name } of listDocs()) {
    const body = readDoc(name);
    if (!body) continue;
    const lines = body.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        hits.push({ doc: name, line: i + 1, text: lines[i].trim().slice(0, 240) });
        if (hits.length >= maxHits) return hits;
      }
    }
  }
  return hits;
}

/** Index injected into the system prompt so the model knows what's available. */
export function docIndex(): string {
  const docs = listDocs();
  if (docs.length === 0) return "(no docs available)";
  return docs.map((d) => `- ${d.name}${d.title ? ` — ${d.title}` : ""}`).join("\n");
}

// ── admin doc management (used by ! commands; operates on the same dir) ──
export function saveDoc(name: string, content: string): string {
  const safe = safeName(name);
  if (!isKnowledgeDoc(safe)) throw new Error(`reserved doc name: ${safe}`);
  const file = path.join(DOCS_DIR, safe);
  writeFileSync(file, content, "utf-8");
  return path.basename(file);
}
export function deleteDoc(name: string): boolean {
  const safe = safeName(name);
  if (!isKnowledgeDoc(safe)) return false;
  const file = path.join(DOCS_DIR, safe);
  if (!existsSync(file)) return false;
  unlinkSync(file);
  return true;
}
