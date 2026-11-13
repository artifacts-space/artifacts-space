import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { richEditorExtensions } from "@/components/editor/rich/editor-extensions";
import { getSchema } from "@tiptap/core";

import { positionForOffset, takesOverNow } from "./caret-handoff";
import { parseCommentMarkdown } from "./comment-markdown";

const schema = getSchema(richEditorExtensions({ onLinkShortcut: () => false, media: false }));

function docFor(markdown: string): ProseMirrorNode {
  return ProseMirrorNode.fromJSON(schema, parseCommentMarkdown(markdown).doc);
}

/** The document text before a position, with blocks joined the way the plain box writes them. */
function textBefore(doc: ProseMirrorNode, position: number): string {
  return doc.textBetween(0, position, "\n\n", "\n");
}

describe("positionForOffset", () => {
  it("should put the caret at the same character when the text is plain", () => {
    const markdown = "First thought.\n\nSecond one,\nwith a break.";
    const doc = docFor(markdown);
    for (const offset of [0, 5, 14, 16, 22, 28, markdown.length]) {
      expect(textBefore(doc, positionForOffset(doc, offset))).toBe(markdown.slice(0, offset));
    }
  });

  it("should put the caret at the end when the offset is past the text", () => {
    const doc = docFor("Short.");
    expect(positionForOffset(doc, 99)).toBe(doc.content.size - 1);
  });

  it("should put the caret at the start when the box is empty", () => {
    const doc = docFor("");
    expect(positionForOffset(doc, 4)).toBe(1);
  });
});

describe("takesOverNow", () => {
  it("should take over when the plain box is empty and has the caret", () => {
    expect(takesOverNow({ text: "", opening: "", focused: true })).toBe(true);
  });

  it("should take over when the plain box holds text but not the caret", () => {
    expect(takesOverNow({ text: "Typed, then left.", opening: "", focused: false })).toBe(true);
  });

  it("should wait when the plain box has the caret and text typed in it", () => {
    for (const text of ["First wo", "Words then a space ", "Line one\n", "```\ncode\n```\n", "| a | b |\n| - | - |\n| 1 | 2 |\n"]) {
      expect(takesOverNow({ text, opening: "", focused: true })).toBe(false);
    }
  });

  it("should take over an edit box that still holds the comment it opened with", () => {
    expect(takesOverNow({ text: "The **old** comment", opening: "The **old** comment", focused: true })).toBe(true);
  });

  it("should wait when the text ends in a space, tab, or line break, even without the caret", () => {
    for (const text of ["Some **bold** words ", "Tabbed\t", "Line one\n", "Para one\n\n"]) {
      expect(takesOverNow({ text, opening: "", focused: false })).toBe(false);
      expect(takesOverNow({ text, opening: text, focused: true })).toBe(false);
    }
  });

  it("should wait when an edit box has the caret and its comment was changed", () => {
    expect(takesOverNow({ text: "The **old** comment, changed", opening: "The **old** comment", focused: true })).toBe(false);
  });
});
