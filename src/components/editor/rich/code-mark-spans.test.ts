import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { withCodeSpans } from "./code-mark-spans";
import { emptySourceMap, parseMarkdown, serializeMarkdown } from "./markdown-roundtrip";

function text(value: string, ...marks: string[]): JSONContent {
  return { type: "text", text: value, marks: marks.map((type) => ({ type })) };
}

function written(content: JSONContent[]): string {
  return serializeMarkdown({ type: "doc", content: [{ type: "paragraph", content }] }, emptySourceMap());
}

function marksOf(markdown: string): string[][] {
  const [paragraph] = parseMarkdown(markdown).doc.content ?? [];
  return (paragraph?.content ?? []).map((child) => [child.text ?? "", ...(child.marks ?? []).map((mark) => mark.type).sort()]);
}

describe("withCodeSpans", () => {
  it("should give one span number to a run of code whose other marks stay the same", () => {
    const [paragraph] = withCodeSpans([{ type: "paragraph", content: [text("a", "bold", "code"), text("b", "bold", "code")] }]);
    expect(paragraph?.content?.map((child) => child.marks?.find((mark) => mark.type === "code")?.attrs)).toEqual([{ span: 0 }, { span: 0 }]);
  });

  it("should change the span number when the other marks change inside a run of code", () => {
    const [paragraph] = withCodeSpans([{ type: "paragraph", content: [text("a", "code"), text("b", "code", "bold"), text("c", "code")] }]);
    expect(paragraph?.content?.map((child) => child.marks?.find((mark) => mark.type === "code")?.attrs)).toEqual([{ span: 0 }, { span: 1 }, { span: 2 }]);
  });

  it("should tag code inside nested blocks such as table cells", () => {
    const cell: JSONContent = { type: "tableCell", content: [{ type: "paragraph", content: [text("a", "code"), text("b", "code", "italic")] }] };
    const [table] = withCodeSpans([{ type: "table", content: [{ type: "tableRow", content: [cell] }] }]);
    const marks = table?.content?.[0]?.content?.[0]?.content?.[0]?.content?.map((child) => child.marks?.find((mark) => mark.type === "code")?.attrs);
    expect(marks).toEqual([{ span: 0 }, { span: 1 }]);
  });
});

describe("code inside other marks", () => {
  it("should write no mark between backticks when part of a code span is bold", () => {
    const markdown = written([text("ab", "code"), text("cd", "code", "bold"), text("ef", "code")]);
    expect(markdown).toBe("`ab`**`cd`**`ef`\n");
    expect(marksOf(markdown)).toEqual([["ab", "code"], ["cd", "bold", "code"], ["ef", "code"]]);
  });

  it("should write code innermost when it carries bold and italic", () => {
    const markdown = written([text("c", "bold", "italic", "code")]);
    expect(markdown).toBe("***`c`***\n");
    expect(marksOf(markdown)).toEqual([["c", "bold", "code", "italic"]]);
  });

  it("should keep italic that starts inside code and runs past it", () => {
    const markdown = written([text("ab", "code"), text("cd", "code", "italic"), text(" tail", "italic")]);
    expect(marksOf(markdown)).toEqual([["ab", "code"], ["cd", "code", "italic"], [" tail", "italic"]]);
  });

  it("should load bold text with code in it as formatted text when loaded", () => {
    expect(parseMarkdown("**see `x`** now\n").rawBlocks).toBe(0);
  });
});
