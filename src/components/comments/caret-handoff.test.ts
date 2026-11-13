import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { richEditorExtensions } from "@/components/editor/rich/editor-extensions";
import { getSchema } from "@tiptap/core";

import { positionForOffset, withoutTypedTail, withTypedTail } from "./caret-handoff";
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

/** The rich box's document for the plain box's text at hand-over. */
function handedOver(markdown: string): ProseMirrorNode {
  return ProseMirrorNode.fromJSON(schema, withTypedTail(parseCommentMarkdown(withoutTypedTail(markdown)).doc, markdown));
}

/** Each top-level block as its type and text. */
function blocks(doc: ProseMirrorNode): string[] {
  const out: string[] = [];
  doc.forEach((node) => { out.push(`${node.type.name}:${node.textContent}`); });
  return out;
}

describe("withoutTypedTail", () => {
  it("should drop only the spaces and line breaks at the end when the text ends in them", () => {
    expect(withoutTypedTail("Para one\n\n")).toBe("Para one");
    expect(withoutTypedTail("  a b \t\n")).toBe("  a b");
    expect(withoutTypedTail("no tail")).toBe("no tail");
  });
});

describe("withTypedTail", () => {
  it("should keep the space typed last when the text ends in a space", () => {
    expect(blocks(handedOver("before it "))).toEqual(["paragraph:before it "]);
    expect(blocks(handedOver("two spaces  "))).toEqual(["paragraph:two spaces  "]);
  });

  it("should keep a line break in its paragraph when the text ends in one", () => {
    expect(blocks(handedOver("line one\n"))).toEqual(["paragraph:line one\n"]);
  });

  it("should start a new paragraph when the text ends in a blank line", () => {
    expect(blocks(handedOver("para one\n\n"))).toEqual(["paragraph:para one", "paragraph:"]);
    expect(blocks(handedOver("para one\n\n  "))).toEqual(["paragraph:para one", "paragraph:  "]);
  });

  it("should leave the space unmarked when the text before it is bold", () => {
    const paragraph = handedOver("**bold** ").firstChild;
    expect(paragraph?.textContent).toBe("bold ");
    expect(paragraph?.lastChild?.marks).toHaveLength(0);
  });

  it("should keep the space in a heading and start a paragraph after a line break", () => {
    expect(blocks(handedOver("# Title "))).toEqual(["heading:Title "]);
    expect(blocks(handedOver("# Title\n"))).toEqual(["heading:Title", "paragraph:"]);
  });

  it("should keep the space in the last list item when the text ends in a list", () => {
    expect(handedOver("- one\n- two ").textContent).toBe("onetwo ");
  });

  it("should start a paragraph when the text ends in a block without text", () => {
    expect(blocks(handedOver("Above\n\n---\n"))).toEqual(["paragraph:Above", "horizontalRule:", "paragraph:"]);
  });

  it("should keep spaces typed into an empty box", () => {
    expect(blocks(handedOver("   "))).toEqual(["paragraph:   "]);
  });

  it("should return the document as read when nothing trails the text", () => {
    const { doc } = parseCommentMarkdown("Done.");
    expect(withTypedTail(doc, "Done.")).toBe(doc);
  });

  it("should leave the loaded document unchanged when it adds a tail", () => {
    const { doc } = parseCommentMarkdown("before it ");
    const before = JSON.stringify(doc);
    withTypedTail(doc, "before it ");
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("should put the caret after the tail when the plain box's caret was at the end", () => {
    for (const markdown of ["before it ", "line one\n", "para one\n\n", "para one\n\n  "]) {
      const doc = handedOver(markdown);
      expect(textBefore(doc, positionForOffset(doc, markdown.length))).toBe(markdown);
    }
  });
});
