import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { find, textOf } from "./list-edit-helpers";
import { readsTheSame } from "./markdown-display-shape";
import { emptySourceMap, parseMarkdown, serializeMarkdown } from "./markdown-roundtrip";

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function item(...content: JSONContent[]): JSONContent {
  return { type: "listItem", content };
}

function task(checked: boolean, ...content: JSONContent[]): JSONContent {
  return { type: "taskItem", attrs: { checked }, content };
}

function quote(text: string): JSONContent {
  return { type: "blockquote", content: [paragraph(text)] };
}

/** Saves a list that was never loaded from Markdown, as a new or pasted list is. */
function written(list: JSONContent): string {
  return serializeMarkdown({ type: "doc", content: [list] }, emptySourceMap());
}

describe("numbered items read by the list item rule", () => {
  it.each([
    "1. **bold** x\n2. b\n",
    "1. a [link](https://example.com)\n2. b\n",
    "1. see `code`\n2. snake_case\n",
    "1. Tom & Jerry\n2. 5 < 6\n",
    "1. a\n\n2. 2 * 3\n",
    "- a\n  1. nested * star\n",
    "9) ~~gone~~ now\n10) 100% *sure*\n",
  ])("should format %j when a numbered item holds formatting or a character Markdown escapes", (markdown) => {
    expect(parseMarkdown(markdown).rawBlocks).toBe(0);
  });

  it("should read bold in a numbered item as bold, not as stars, when the list loads", () => {
    const loaded = parseMarkdown("1. **bold** x\n");
    const text = find(loaded.doc, "text", "bold");
    expect(text.text).toBe("bold");
    expect(text.marks?.map((mark) => mark.type)).toEqual(["bold"]);
    expect(textOf(loaded.doc)).toBe("bold x");
  });
});

describe("a list written fresh", () => {
  it("should put blank lines around the blocks of an item when a numbered list right under a quote would read as part of the quote", () => {
    const list: JSONContent = { type: "bulletList", content: [item(paragraph("a"), quote("q"), { type: "orderedList", attrs: { start: 9 }, content: [item(paragraph("one"))] }), item(paragraph("b"))] };
    const saved = written(list);
    expect(saved).toBe("- a\n\n  > q\n\n  9. one\n\n- b\n");
    const again = parseMarkdown(saved);
    expect(again.rawBlocks).toBe(0);
    expect(readsTheSame(saved, again.doc.content ?? [])).toBe(true);
  });

  it("should keep the editor's own tight writing when it reads back as the list", () => {
    expect(written({ type: "bulletList", content: [item(paragraph("a"), quote("q")), item(paragraph("b"))] })).toBe("- a\n  > q\n- b\n");
    expect(written({ type: "taskList", content: [task(false, paragraph("a"), paragraph("second")), task(true, paragraph("b"))] })).toBe("- [ ] a\n\n  second\n- [x] b\n");
  });

  it("should load a list as formatted, and keep it formatted after an item is added, when only the wide writing reads back", () => {
    const markdown = "- [x] a\n\n  > one\n\n  > two\n";
    const loaded = parseMarkdown(markdown);
    expect(loaded.rawBlocks).toBe(0);
    const doc = structuredClone(loaded.doc);
    doc.content?.[0]?.content?.push(task(false, { type: "paragraph", attrs: { color: null, background: null }, content: [{ type: "text", text: "new" }] }));
    const saved = serializeMarkdown(doc, loaded.source);
    expect(saved).toBe("- [x] a\n\n  > one\n\n  > two\n- [ ] new\n");
    const again = parseMarkdown(saved);
    expect(again.rawBlocks).toBe(0);
    expect(readsTheSame(saved, again.doc.content ?? [])).toBe(true);
  });
});
