import { test } from "node:test";
import assert from "node:assert/strict";
import { createAssistantMessageEventStream, type AssistantMessage } from "@earendil-works/pi-ai";
import { runTurn, type TurnContext } from "./agent.js";
import type { DiscordActions } from "./skills/discordActions.js";

const ctx: TurnContext = { channelId: "test", channelName: "test", userId: "user", userName: "Alice",
  text: "hi", history: "[FOCUS][NOW] Alice: hi", actions: {} as DiscordActions };
function stream(messages: Array<Partial<AssistantMessage>>) {
  let n = 0;
  return () => {
    const part = messages[n++];
    assert.ok(part, "no unexpected model request");
    const message = { role: "assistant", content: [], api: "openai-completions", provider: "aipowergrid",
      model: "qwen3-27b", timestamp: Date.now(), stopReason: "stop",
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, ...part } as AssistantMessage;
    const events = createAssistantMessageEventStream();
    events.push({ type: "done", reason: message.stopReason as "stop", message });
    return events;
  };
}
const finish = (action: "reply" | "silent", text?: string): Partial<AssistantMessage> => ({
  stopReason: "toolUse", content: [{ type: "text", text: "Private scratch must not appear." },
    { type: "toolCall", id: "finish", name: "finish_turn", arguments: { action, text } }],
});
test("only the explicit final reply is published, never scratch or trailing text", async () => {
  const r = await runTurn(ctx, { tools: [], streamFn: stream([finish("reply", "hey"), { content: [{ type: "text", text: "extra private text" }] }]) });
  assert.equal(r.finalText, "hey"); assert.equal(r.error, false);
  assert.equal(r.metrics.modelCalls, 1);
  assert.equal(r.metrics.toolCalls, 1);
  assert.ok(r.metrics.modelMs >= 0 && r.metrics.toolMs >= 0);
});
test("silence discards ordinary model text", async () => {
  const r = await runTurn(ctx, { tools: [], streamFn: stream([finish("silent"), {}]) });
  assert.equal(r.finalText, ""); assert.equal(r.decision, "silent"); assert.equal(r.error, false);
});
test("missing structured finish never leaks free text", async () => {
  const r = await runTurn(ctx, { tools: [], streamFn: stream([{ content: [{ type: "text", text: "I should stay quiet" }] }]) });
  assert.equal(r.finalText, ""); assert.equal(r.error, true);
  assert.equal(r.failureReason, "missing_finish");
});
test("failed generation cannot publish a selected reply", async () => {
  const r = await runTurn(ctx, { tools: [], streamFn: stream([{ ...finish("reply", "hey"), stopReason: "aborted" }]) });
  assert.equal(r.finalText, ""); assert.equal(r.error, true);
});
test("room change is given to same agent before it chooses silence", async () => {
  let refreshes = 0;
  const r = await runTurn({ ...ctx, refreshContext: async () => ++refreshes === 1 ? "Bob already answered it" : undefined },
    { tools: [], streamFn: stream([finish("reply", "old answer"), finish("silent"), {}]) });
  assert.equal(refreshes, 2); assert.equal(r.decision, "silent"); assert.equal(r.error, false);
  assert.equal(r.metrics.contextRefreshes, 1);
});

test("a valid finish needs no follow-up provider call", async () => {
  const r = await runTurn(ctx, { tools: [], streamFn: stream([finish("silent")]) });
  assert.equal(r.error, false);
  assert.equal(r.metrics.modelCalls, 1);
});

test("trailing tool calls cannot override a final decision or execute effects", async () => {
  let effects = 0;
  const done = finish("reply", "final");
  done.content!.push({ type: "toolCall", id: "trailing", name: "finish_turn", arguments: { action: "silent" } });
  const r = await runTurn({ ...ctx, refreshContext: async () => { effects++; return undefined; } },
    { tools: [], streamFn: stream([done]) });
  assert.equal(r.finalText, "final");
  assert.equal(effects, 1, "trailing finish is not executed");
  assert.equal(r.metrics.modelCalls, 1);
});

test("rejected unknown calls still exhaust the tool-attempt budget", async () => {
  const invalid: Partial<AssistantMessage> = { stopReason: "toolUse", content:
    Array.from({ length: 20 }, (_, i) => ({ type: "toolCall" as const,
      id: `invalid-${i}`, name: "does_not_exist", arguments: {} })) };
  const r = await runTurn(ctx, { tools: [], streamFn: stream([invalid, { stopReason: "aborted" }]) });
  assert.equal(r.error, true);
  assert.equal(r.failureReason, "tool_budget");
  assert.equal(r.metrics.toolCalls, 17);
  assert.equal(r.finalText, "");
});
