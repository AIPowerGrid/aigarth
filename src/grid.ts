import type { Model } from "@earendil-works/pi-ai";
import { config } from "./config.js";

/**
 * The Grid as a pi-ai model.
 *
 * This is the whole point of the revamp: aigarth's brain talks to the AI Power
 * Grid's own OpenAI-compatible /v1, not a third-party API. pi-ai supports any
 * OpenAI-compatible endpoint via a custom Model with `baseUrl`, so the agent
 * loop, tool calling, and streaming all run on Grid workers — proof the network
 * serves agentic workloads.
 */
export function gridModel(): Model<"openai-completions"> {
  return {
    id: config.gridChatModel,
    name: `Grid (${config.gridChatModel})`,
    api: "openai-completions",
    provider: "aipowergrid",
    baseUrl: config.gridV1Url,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: config.gridContextWindow,
    maxTokens: config.gridMaxTokens,
  };
}
