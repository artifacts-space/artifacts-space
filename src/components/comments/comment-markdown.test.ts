import { getSchema, type JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { markdownSchemaExtensions } from "@/components/editor/rich/markdown-schema";
import { parseMarkdown, serializeMarkdown } from "@/components/editor/rich/markdown-roundtrip";
import { parseMentions } from "@/lib/comments/mentions";

import { mentionEditAt, mentionMatchAt } from "./mention-match";
import { quotedCommentBody } from "./quote-request";

/*
 * The rich comment box reads and writes a comment's Markdown with the
 * artifact editor's round trip. These pin what that means for comments:
 * stored bodies come back unchanged, typed formatting becomes the Markdown
 * the thread renders, and @mentions stay plain text the server reads.
 */

const schema = getSchema(markdownSchemaExtensions());

function text(value: string, marks: string[] = []): JSONContent {
  return marks.length > 0 ? { type: "text", text: value, marks: marks.map((type) => ({ type })) } : { type: "text", text: value };
}

function paragraph(...content: JSONContent[]): JSONContent {
  return { type: "paragraph", content };
}

function written(content: JSONContent[]): string {
  return serializeMarkdown({ type: "doc", content }, parseMarkdown("").source);
}

describe("comment Markdown in the rich box", () => {
  const stored = [
    "Hi @dana, can you check?",
    "line one\nline two",
    "> quote\n\nreply",
    "1. one\n2. two",
    "Use `@dana` here",
    "Price: $5 \\* 2",
    "Raw <b>html</b> stays",
    quotedCommentBody("Ship it on Friday.", "https://artifacts.space/artifact/abc#block=Ship"),
  ];

  it.each(stored)("should write a stored comment back exactly when nobody edits it: %j", (body) => {
    const loaded = parseMarkdown(body);
    expect(serializeMarkdown(loaded.doc, loaded.source)).toBe(body);
  });

  it("should show a quoted block as a quote, not as raw Markdown, when a comment starts from the block menu", () => {
    const loaded = parseMarkdown(quotedCommentBody("Ship it on Friday.", "https://artifacts.space/artifact/abc#block=Ship"));
    expect(loaded.rawBlocks).toBe(0);
    expect(loaded.doc.content?.map((node) => node.type)).toEqual(["blockquote"]);
  });

  it("should keep the untouched blocks of an edited comment as written when a paragraph is added", () => {
    const body = "Hi @dana,\n\n* first\n* second";
    const loaded = parseMarkdown(body);
    const content = [...(loaded.doc.content ?? []), paragraph(text("Thanks!"))];
    expect(serializeMarkdown({ type: "doc", content }, loaded.source)).toBe(`${body}\n\nThanks!`);
  });

  it("should write bold, a list, and a mention as Markdown when they are typed in the box", () => {
    const markdown = written([
      paragraph(text("Hi @dana, this is "), text("bold", ["bold"])),
      { type: "bulletList", content: [{ type: "listItem", content: [paragraph(text("one"))] }, { type: "listItem", content: [paragraph(text("two"))] }] },
    ]);
    expect(markdown).toBe("Hi @dana, this is **bold**\n\n- one\n- two");
    expect(parseMentions(markdown)).toEqual(["dana"]);
  });

  it("should end a new comment without a trailing newline when it is one paragraph", () => {
    expect(written([paragraph(text("Looks good."))])).toBe("Looks good.");
  });
});

/** A one-paragraph document and the position just after `caretAt` characters of its text. */
function cursorIn(value: string, caretAt: number, marks: string[] = []) {
  const doc = schema.nodeFromJSON({ type: "doc", content: [paragraph(text(value, marks))] });
  return { doc, $position: doc.resolve(1 + caretAt) };
}

describe("mentionMatchAt", () => {
  it("should find the @handle being typed when the cursor is right after it", () => {
    const match = mentionMatchAt(cursorIn("Hi @da", 6).$position);
    expect(match?.query).toEqual({ start: 3, query: "da" });
    expect(match?.range).toEqual({ from: 4, to: 7 });
  });

  it("should find nothing when the @ is part of an email", () => {
    expect(mentionMatchAt(cursorIn("mail me@exa", 11).$position)).toBeNull();
  });

  it("should find nothing when the cursor is in inline code", () => {
    expect(mentionMatchAt(cursorIn("@da", 3, ["code"]).$position)).toBeNull();
  });

  it("should find nothing when the cursor is in a code block", () => {
    const doc = schema.nodeFromJSON({ type: "doc", content: [{ type: "codeBlock", content: [text("@da")] }] });
    expect(mentionMatchAt(doc.resolve(4))).toBeNull();
  });
});

describe("mentionEditAt", () => {
  it("should replace the typed letters with the handle and a space when the mention ends the line", () => {
    const match = mentionMatchAt(cursorIn("Hi @da", 6).$position);
    expect(match && mentionEditAt(match, "dana")).toEqual({ from: 4, to: 7, insert: "@dana ", caret: 10 });
  });

  it("should replace the rest of the handle and step over the space when text follows", () => {
    const match = mentionMatchAt(cursorIn("@daxx please", 3).$position);
    expect(match && mentionEditAt(match, "dana")).toEqual({ from: 1, to: 6, insert: "@dana", caret: 7 });
  });
});
