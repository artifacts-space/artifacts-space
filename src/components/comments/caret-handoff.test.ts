import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { richEditorExtensions } from "@/components/editor/rich/editor-extensions";
import { getSchema } from "@tiptap/core";

import { positionForOffset } from "./caret-handoff";
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
