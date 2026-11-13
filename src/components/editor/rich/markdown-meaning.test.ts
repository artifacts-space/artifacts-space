import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { asStored } from "./markdown-meaning";

const text = (value: string): JSONContent => ({ type: "text", text: value });
const lineBreak: JSONContent = { type: "hardBreak" };
const paragraph = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });

describe("content as Markdown can store it", () => {
  it("should drop the spaces that end a paragraph when a space was typed after its last word", () => {
    expect(asStored([paragraph(text("gamma "))])).toEqual([paragraph(text("gamma"))]);
  });

  it("should drop a line break with nothing after it when Shift+Enter ended the paragraph", () => {
    expect(asStored([paragraph(text("gamma"), lineBreak)])).toEqual([paragraph(text("gamma"))]);
    expect(asStored([paragraph(text("gamma"), lineBreak, text(" "))])).toEqual([paragraph(text("gamma"))]);
  });

  it("should drop the spaces around a line break when a line ends or starts with them", () => {
    expect(asStored([paragraph(text("one "), lineBreak, text("  two"))])).toEqual([paragraph(text("one"), lineBreak, text("two"))]);
  });

  it("should leave a paragraph with no content when it holds only spaces", () => {
    expect(asStored([paragraph(text("  "))])).toEqual([{ type: "paragraph" }]);
  });

  it("should keep the spaces between words and those inside a nested block when they are not at a line's ends", () => {
    const list: JSONContent = { type: "bulletList", content: [{ type: "listItem", content: [paragraph(text("a  b "))] }] };
    expect(asStored([list])).toEqual([{ type: "bulletList", content: [{ type: "listItem", content: [paragraph(text("a  b"))] }] }]);
  });

  it("should keep every character of a code block when its lines end with spaces", () => {
    const code: JSONContent = { type: "codeBlock", content: [text("x = 1  \n")] };
    expect(asStored([code])).toEqual([code]);
  });
});
