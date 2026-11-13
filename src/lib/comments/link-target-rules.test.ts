import { describe, expect, it } from "vitest";

import { linkedCommentTarget, type LinkedComment } from "./link-target-rules";

const words = { quote: "single writer", prefix: "is the ", suffix: ", so" };

function comment(id: string, fields: Partial<LinkedComment> = {}): LinkedComment {
  return { id, parentId: null, deleted: false, resolved: null, anchor: null, ...fields };
}

const resolved = { at: "2026-11-13T10:00:00.000Z", by: "@ada" };
const inline = comment("inline", { anchor: words });
const reply = comment("reply", { parentId: "inline" });
const plain = comment("plain");
const plainReply = comment("plain-reply", { parentId: "plain" });
const thread = [inline, reply, plain, plainReply];
const onPage = new Set(["inline"]);

describe("linkedCommentTarget", () => {
  it("should open the card at the words when the linked comment is an inline comment whose words are on the page", () => {
    expect(linkedCommentTarget(thread, "inline", onPage)).toEqual({ kind: "text", rootId: "inline", commentId: "inline" });
  });

  it("should open the thread's card with the reply in view when the linked reply is on an inline comment on the page", () => {
    expect(linkedCommentTarget(thread, "reply", onPage)).toEqual({ kind: "text", rootId: "inline", commentId: "reply" });
  });

  it("should open the list at the comment when it is on the whole artifact", () => {
    expect(linkedCommentTarget(thread, "plain", onPage)).toEqual({ kind: "list", commentId: "plain" });
  });

  it("should open the list at the reply when the reply is in a thread on the whole artifact", () => {
    expect(linkedCommentTarget(thread, "plain-reply", onPage)).toEqual({ kind: "list", commentId: "plain-reply" });
  });

  it("should open the list at the comment when its words changed and are no longer on the page", () => {
    expect(linkedCommentTarget(thread, "inline", new Set())).toEqual({ kind: "list", commentId: "inline" });
    expect(linkedCommentTarget(thread, "reply", new Set())).toEqual({ kind: "list", commentId: "reply" });
  });

  it("should open the list at the comment when its thread is resolved", () => {
    const done = [comment("inline", { anchor: words, resolved }), reply];
    expect(linkedCommentTarget(done, "inline", onPage)).toEqual({ kind: "list", commentId: "inline" });
    expect(linkedCommentTarget(done, "reply", onPage)).toEqual({ kind: "list", commentId: "reply" });
  });

  it("should open the list when the page shows no inline comments", () => {
    expect(linkedCommentTarget(thread, "inline", null)).toEqual({ kind: "list", commentId: "inline" });
  });

  it("should open the list when the viewer may not read the words the comment is on", () => {
    expect(linkedCommentTarget([comment("inline", { anchor: null })], "inline", onPage)).toEqual({ kind: "list", commentId: "inline" });
  });

  it("should say the comment was deleted when the linked comment is deleted", () => {
    expect(linkedCommentTarget([comment("gone", { deleted: true })], "gone", onPage)).toEqual({ kind: "deleted" });
  });

  it("should say the comment was deleted when the thread no longer holds it", () => {
    expect(linkedCommentTarget(thread, "missing", onPage)).toEqual({ kind: "deleted" });
  });

  it("should open the list at a reply when the thread's first comment was deleted", () => {
    const orphaned = [comment("inline", { deleted: true }), reply];
    expect(linkedCommentTarget(orphaned, "reply", onPage)).toEqual({ kind: "list", commentId: "reply" });
  });
});
