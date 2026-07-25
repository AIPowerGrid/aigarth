import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRoomContext, type RoomMessage } from "./context.js";

const room: RoomMessage[] = [
  {
    id: "m1",
    authorName: "alice",
    authorId: "u1",
    isBot: false,
    isSelf: false,
    content: "can aigarth check the worker?",
    createdTimestamp: Date.parse("2026-07-25T12:00:00Z"),
  },
  {
    id: "m2",
    authorName: "statusbot",
    authorId: "b1",
    isBot: true,
    isSelf: false,
    content: "worker is online",
    createdTimestamp: Date.parse("2026-07-25T12:00:10Z"),
    attachments: ["image graph.png 18KB https://cdn.example/graph.png"],
    reactions: ["✅×2"],
  },
  {
    id: "m3",
    authorName: "bob",
    authorId: "u2",
    isBot: false,
    isSelf: false,
    content: "looks fixed now",
    createdTimestamp: Date.parse("2026-07-25T12:00:20Z"),
    replyTo: {
      messageId: "m1",
      authorName: "alice",
      preview: "can aigarth check the worker?",
    },
  },
];

test("room context marks the focus and current end while preserving visible metadata", () => {
  const context = formatRoomContext(room, "m1", 24_000, "discord", "#workers; topic: worker help");
  assert.equal(context.focusIsLatest, false);
  assert.equal(context.messagesAfterFocus, 2);
  assert.equal(context.latestMessageId, "m3");
  assert.match(context.transcript, /\[FOCUS\].*alice/);
  assert.match(context.transcript, /\[NOW\].*bob/);
  assert.match(context.transcript, /statusbot \(bot\)/);
  assert.match(context.transcript, /attachments: image graph\.png/);
  assert.match(context.transcript, /reactions: ✅×2/);
  assert.match(context.transcript, /replying to alice/);
});

test("room context character budget keeps both the old focus and newest visible state", () => {
  const padded = room.map((message, index) => ({
    ...message,
    content: `${message.content} ${"padding ".repeat(index + 15)}`,
  }));
  const context = formatRoomContext(padded, "m1", 220, "discord");
  assert.match(context.transcript, /\[FOCUS\]/);
  assert.match(context.transcript, /\[NOW\]/);
  assert.equal(context.latestMessageId, "m3");
});
