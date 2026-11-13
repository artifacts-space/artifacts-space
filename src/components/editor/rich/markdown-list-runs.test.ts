import type { JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { unified } from "unified";
import { describe, expect, it, vi } from "vitest";

import { editBothWays, find, paragraph, reloaded, setText, tick } from "./list-edit-helpers";
import { readsTheSame } from "./markdown-display-shape";
import { parseMarkdown, serializeMarkdown } from "./markdown-roundtrip";

const item = (...content: JSONContent[]): JSONContent => ({ type: "listItem", content });
const emptyParagraph = (): JSONContent => ({ type: "paragraph", attrs: { color: null, background: null } });

/** A document's blocks by type, with the item count of each list. */
function blocks(markdown: string): string[] {
  return (parseMarkdown(markdown).doc.content ?? []).map((node) => (node.type?.endsWith("List") ? `${node.type}:${String(node.content?.length)}` : (node.type ?? "")));
}

const itemLine = /^[ \t]*(?:[-+*]|\d{1,9}[.)])(?:[ \t]|$)/gm;

/** How many list items the texts hold, nested ones too. */
function itemsIn(texts: readonly unknown[]): number {
  return texts.reduce<number>((count, text) => count + (typeof text === "string" ? (text.match(itemLine) ?? []).length : 0), 0);
}

/** How many list items the editor's reader and the page's reader read while `run` runs. */
function itemsRead(run: () => void): { editor: number; page: number } {
  const editor = vi.spyOn(MarkdownManager.prototype, "parse");
  const page = vi.spyOn(Object.getPrototypeOf(unified()) as { parse: (text: string) => unknown }, "parse");
  try {
    run();
    return { editor: itemsIn(editor.mock.calls.map(([text]) => text)), page: itemsIn(page.mock.calls.map(([text]) => text)) };
  } finally {
    editor.mockRestore();
    page.mockRestore();
  }
}

describe("the work one edit to a long list takes", () => {
  // 667 steps, each with two tasks under it: 2,001 items.
  const long = `${Array.from({ length: 667 }, (_, index) => `- Step ${String(index)} with **bold**\n  - [ ] child ${String(index)}a\n  - [x] child ${String(index)}b`).join("\n")}\n\nEnd.\n`;

  /** The long list loaded and saved once after an edit: the first edit to a list cuts it into its items. */
  function opened() {
    const loaded = parseMarkdown(long);
    const doc = structuredClone(loaded.doc);
    setText(find(doc, "paragraph", "Step 0 "), "Step 0 with **bold**.");
    serializeMarkdown(doc, loaded.source);
    return { doc: structuredClone(loaded.doc), source: loaded.source };
  }

  it("should read the edited item and the ones beside it, not the list, when a letter is typed in one item", () => {
    const { doc, source } = opened();
    setText(find(doc, "paragraph", "Step 300 "), "Step 300 with words");
    let saved = "";
    const read = itemsRead(() => { saved = serializeMarkdown(doc, source); });
    expect(saved).toBe(long.replace("- Step 300 with **bold**", "- Step 300 with words"));
    // Three steps of three items each: the editor reads them as written and as the round trip's own writer has them
    // (18), and the edited step's two tasks twice more the first time that step is edited. The read view reads the three steps once.
    expect(read).toEqual({ editor: 22, page: 9 });
    setText(find(doc, "paragraph", "Step 300 "), "Step 300 with words!");
    expect(itemsRead(() => { serializeMarkdown(doc, source); })).toEqual({ editor: 18, page: 9 });
  });

  it("should read only the items around the box when a box deep in the list is ticked", () => {
    const { doc, source } = opened();
    tick(doc, "child 500a");
    let saved = "";
    const read = itemsRead(() => { saved = serializeMarkdown(doc, source); });
    expect(saved).toBe(long.replace("- [ ] child 500a", "- [x] child 500a"));
    // The step's two tasks, read when the step's own content loads and when the ticked one is checked, then the three steps.
    expect(read.editor).toBeLessThanOrEqual(30);
    expect(read.page).toBeLessThanOrEqual(15);
  });

  it("should read only the items around a new item when one is added and typed in", () => {
    const { doc, source } = opened();
    const steps = doc.content?.[0]?.content ?? [];
    steps.splice(100, 0, item(paragraph("New")));
    serializeMarkdown(doc, source);
    const added = steps[100]?.content?.[0];
    if (added) setText(added, "New step");
    let saved = "";
    const read = itemsRead(() => { saved = serializeMarkdown(doc, source); });
    expect(saved).toBe(long.replace("- Step 100 with **bold**", "- New step\n- Step 100 with **bold**"));
    // The step before, the new item, and the step after.
    expect(read).toEqual({ editor: 14, page: 7 });
  });
});

describe("a list beside a block it could join", () => {
  // Three lists, as both readers have them: the second and third sit too far out to be under `one`.
  const between = "1. one\n  * sub\n  2. two\n";

  it("should write an item added to a list as far in as the list's other items", () => {
    expect(blocks(between)).toEqual(["orderedList:1", "bulletList:1", "orderedList:1"]);
    const { doc, saved } = editBothWays(between, (edited) => { edited.content?.[1]?.content?.push(item(paragraph("new"))); });
    expect(saved).toBe("1. one\n  * sub\n  * new\n  2. two\n");
    expect(reloaded(saved)).toEqual(doc);
    expect(readsTheSame(saved, doc.content ?? [])).toBe(true);
  });

  it("should write the list whole when an item with no text yet at its end would take in the list below", () => {
    const markdown = "*  line one\n   lazy two\n  + plain\n";
    expect(blocks(markdown)).toEqual(["bulletList:1", "bulletList:1"]);
    const { saved, whole } = editBothWays(markdown, (edited) => { edited.content?.[0]?.content?.push(item(emptyParagraph())); });
    // Over its items the list would end `* ` and `  + plain` would sit inside that item.
    expect(saved).toBe(whole);
    expect(saved).not.toContain("*");
  });

  it("should write the list whole when a new last item would take in the indented list below", () => {
    const markdown = "1)  ends:\n\n   - [x] task\n";
    expect(blocks(markdown)).toEqual(["orderedList:1", "taskList:1"]);
    const { saved, whole } = editBothWays(markdown, (edited) => { edited.content?.[0]?.content?.push(item(paragraph("new item"))); });
    expect(saved).toBe(whole);
    expect(saved).not.toContain("1)");
  });

  it("should write the list whole when renumbering moves its last item's text over a block below", () => {
    // `10.` puts the item's text four columns in; `   - [x] apart` (three) is a list of its own below it.
    const markdown = "9. a\n10. b\n\n   - [x] apart\n";
    expect(blocks(markdown)).toEqual(["orderedList:2", "taskList:1"]);
    const { saved, whole } = editBothWays(markdown, (edited) => { edited.content?.[0]?.content?.splice(0, 1); });
    // Over its items the list would be `9. b`, three columns in, and the task list would fall inside it.
    expect(saved).toBe(whole);
  });

  it("should keep a list below apart when an item with no text yet ends the list above it", () => {
    const markdown = "* a\n2. two\n";
    expect(blocks(markdown)).toEqual(["bulletList:1", "orderedList:1"]);
    const { doc, saved } = editBothWays(markdown, (edited) => { edited.content?.[0]?.content?.push(item(emptyParagraph())); });
    // `2. two` sits at the start of its line, too far out to be in the empty item: both readers keep it a list of its own.
    expect(saved).toBe("* a\n* \n2. two\n");
    expect(reloaded(saved)).toEqual(doc);
    expect(readsTheSame(saved, doc.content ?? [])).toBe(true);
  });

  it("should leave the blocks around the list unread when an item in its middle is edited", () => {
    const markdown = "* a\n* b\n* c\n  + plain\n";
    const { saved } = editBothWays(markdown, (edited) => { setText(find(edited, "paragraph", "b"), "bee"); });
    expect(saved).toBe("* a\n* bee\n* c\n  + plain\n");
  });
});

describe("the read view's reading of what was edited", () => {
  it("should set a nested numbered list apart when the read view would read it as text under the item", () => {
    // marked reads `2. x` under `a` as a list; the read view reads it as more of `a`, since only 1 can start a list in a paragraph.
    const { doc, saved } = editBothWays("* a\n  1. x\n* b\n", (edited) => {
      const nested = find(edited, "orderedList", "x");
      nested.attrs = { ...nested.attrs, start: 2 };
    });
    expect(saved).toBe("* a\n\n  2. x\n* b\n");
    expect(readsTheSame(saved, doc.content ?? [])).toBe(true);
  });

  it("should write the list whole when an edited item reads as a heading in the read view", () => {
    // `* b` then `  -` under it: the read view reads `b` over a line of dashes as a heading.
    const { saved, whole } = editBothWays("* a\n* b\n  - c\n", (edited) => { find(edited, "paragraph", "c").content = []; });
    expect(saved).toBe(whole);
  });
});
