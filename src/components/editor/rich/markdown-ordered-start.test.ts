import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { emptySourceMap, parseMarkdown, serializeMarkdown } from "./markdown-roundtrip";
import { fromZero } from "./markdown-schema";

const item = (text: string, ...more: JSONContent[]): JSONContent => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text }] }, ...more] });
const ordered = (start: number, ...items: JSONContent[]): JSONContent => ({ type: "orderedList", attrs: { start }, content: items });

function written(...content: JSONContent[]): string {
  return serializeMarkdown({ type: "doc", content }, emptySourceMap());
}

describe("numbered lists that do not start at 1", () => {
  it("should write a list that starts at 0 from 0 when it is written fresh", () => {
    expect(written(ordered(0, item("a"), item("b")))).toBe("0. a\n1. b\n");
  });

  it("should load a list that starts at 0 as a formatted list when it is loaded", () => {
    const loaded = parseMarkdown("0. a\n1. b\n");
    expect(loaded.rawBlocks).toBe(0);
    expect(loaded.doc.content?.[0]?.attrs?.start).toBe(0);
  });

  it("should set a nested list that starts at 3 apart from its item's text when it is written", () => {
    const markdown = written({ type: "bulletList", content: [item("x", ordered(3, item("a"), item("b")))] });
    const [list] = parseMarkdown(markdown).doc.content ?? [];
    const nested = list?.content?.[0]?.content?.[1];
    expect(nested?.type).toBe("orderedList");
    expect(nested?.attrs?.start).toBe(3);
  });

  it("should write a nested list that starts at 1 right under its item's text", () => {
    expect(written({ type: "bulletList", content: [item("x", ordered(1, item("a")))] })).toBe("- x\n  1. a\n");
  });
});

describe("fromZero", () => {
  it("should renumber only the markers that start a line", () => {
    expect(fromZero("1. a\n   1. nested\n2. b 3. c\n10) d\n")).toBe("0. a\n   1. nested\n1. b 3. c\n9) d\n");
  });
});
