import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { listDocs, readDoc, grepDocs } from "../docs/store.js";

/**
 * Doc skills — agentic file retrieval over the markdown knowledge base.
 * Replaces the vector-RAG search_docs. The model sees the doc index in its
 * system prompt, then reads whole docs or greps for exact terms.
 */

export function makeReadDocTool(): AgentTool {
  return {
    name: "read_doc",
    label: "Read Doc",
    description:
      "Read a full AI Power Grid documentation file by name (see the doc index " +
      "in your instructions). Use this to answer factual questions about AIPG " +
      "accurately instead of guessing.",
    parameters: Type.Object({
      name: Type.String({ description: "Doc filename, e.g. 'tokenomics.md'." }),
    }),
    execute: async (_id, params: any) => {
      const body = readDoc(params.name);
      if (body == null) {
        const avail = listDocs().map((d) => d.name).join(", ");
        return {
          content: [{ type: "text", text: `No doc named "${params.name}". Available: ${avail}` }],
          details: { found: false },
        };
      }
      return { content: [{ type: "text", text: body }], details: { name: params.name, found: true } };
    },
  };
}

export function makeGrepDocsTool(): AgentTool {
  return {
    name: "grep_docs",
    label: "Search Docs",
    description:
      "Keyword-search the AI Power Grid docs for an exact term or phrase. Returns " +
      "matching lines with their doc + line number; then read_doc the most " +
      "relevant file. Good when you don't know which doc has the answer.",
    parameters: Type.Object({
      query: Type.String({ description: "Exact term/phrase to search for." }),
    }),
    execute: async (_id, params: any) => {
      const hits = grepDocs(String(params.query));
      if (hits.length === 0) {
        return { content: [{ type: "text", text: "No matches in the docs." }], details: { count: 0 } };
      }
      const text = hits.map((h) => `${h.doc}:${h.line}: ${h.text}`).join("\n");
      return { content: [{ type: "text", text }], details: { count: hits.length } };
    },
  };
}

export function makeListDocsTool(): AgentTool {
  return {
    name: "list_docs",
    label: "List Docs",
    description: "List the available AI Power Grid documentation files and their titles.",
    parameters: Type.Object({}),
    execute: async () => {
      const docs = listDocs();
      const text = docs.map((d) => `${d.name}${d.title ? ` — ${d.title}` : ""}`).join("\n");
      return { content: [{ type: "text", text: text || "(none)" }], details: { count: docs.length } };
    },
  };
}
