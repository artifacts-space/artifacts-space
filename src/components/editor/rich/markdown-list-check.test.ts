import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { editAndSave, find, paragraph, reloaded } from "./list-edit-helpers";
import { readsTheSame } from "./markdown-display-shape";
import { emptySourceMap, serializeMarkdown } from "./markdown-roundtrip";

/** Saved Markdown that the editor and the read view both read as the edited content. */
function expectReadsBack({ doc, saved }: { doc: JSONContent; saved: string }) {
  expect(reloaded(saved), saved).toEqual(doc);
  expect(readsTheSame(saved, doc.content ?? []), saved).toBe(true);
}

/**
 * Saved Markdown the read view shows as the edit, and the editor loads as
 * the edit or keeps as written. A paragraph after a table in an item stays
 * as written when it loads again: a fresh save of that item would join the
 * paragraph to the table, so the editor does not offer one.
 */
function expectShownAsEdited({ doc, saved }: { doc: JSONContent; saved: string }) {
  expect(readsTheSame(saved, doc.content ?? []), saved).toBe(true);
  const again = reloaded(saved);
  if (again.content?.[0]?.type === "rawMarkdown") expect(again.content[0].attrs?.source, saved).toBe(saved.trimEnd());
  else expect(again, saved).toEqual(doc);
}

function itemWith(doc: JSONContent, words: string): JSONContent {
  return find(doc, "listItem", words);
}

describe("an edited list that would read back differently", () => {
  it("should keep two paragraphs apart when the code block between them in an item is deleted", () => {
    const result = editAndSave("- Paste:\n\n  ```text\n  Save\n  ```\n  Expect.\n- b\n", (doc) => { itemWith(doc, "Paste").content?.splice(1, 1); });
    expectReadsBack(result);
    expect(result.saved).toBe("- Paste:\n\n  Expect.\n- b\n");
  });

  it("should put blank lines around a paragraph added to a tight item, so it does not join the text above", () => {
    const result = editAndSave("- a\n  - child\n- b\n", (doc) => { itemWith(doc, "child").content?.splice(1, 0, paragraph("new")); });
    expectReadsBack(result);
    expect(result.saved).toBe("- a\n\n  new\n\n  - child\n- b\n");
  });

  it("should write a nested list that the read view would read as text with a blank line before it", () => {
    const result = editAndSave("- a\n  1. x\n- b\n", (doc) => {
      const nested = find(doc, "orderedList", "x");
      nested.attrs = { ...nested.attrs, start: 2 };
    });
    expectReadsBack(result);
    expect(result.saved).toBe("- a\n\n  2. x\n- b\n");
  });

  it("should write the list fresh when its items cannot be cut from the source", () => {
    const markdown = "- a\n\t- tabbed\n- b\n";
    const result = editAndSave(markdown, (doc) => { const text = find(doc, "paragraph", "b").content?.[0]; if (text) text.text = "bee"; });
    expect(reloaded(result.saved)).toEqual(result.doc);
    expect(result.saved).toBe(serializeMarkdown(result.doc, emptySourceMap()));
  });

  it("should write the list fresh when the edited list would not read back the same", () => {
    const result = editAndSave("1. a\n2. b\n", (doc) => { find(doc, "paragraph", "a").content = []; });
    expect(result.saved).toBe(serializeMarkdown(result.doc, emptySourceMap()));
  });
});

const shapes = [
  "- Run this:\n\n  ```sh\n  pnpm install\n  ```\n\n  Then open it.\n- Next\n",
  "- [ ] **2. Save.** Paste:\n\n  ```text\n  Save \"this\".\n  ```\n\n  Expect: a link.\n\n- [ ] **Show it.** Open it.\n",
  "1. Install:\n\n   ```sh\n   pnpm install\n   ```\n\n2. Run it.\n",
  "- Plan\n  1. one\n  2. two\n     - [ ] task\n- Ship\n",
  "- Note:\n\n  > Quoted text.\n\n- Next\n",
  "- Results:\n\n  | a | b |\n  | --- | --- |\n  | 1 | 2 |\n- Next\n",
  "* one\n  more of one\n* two\n",
];

/** Every block of every item: a path to its item and its place in the item. */
function itemBlocks(doc: JSONContent): { item: number; block: number }[] {
  const list = doc.content?.[0];
  return (list?.content ?? []).flatMap((item, itemIndex) => (item.content ?? []).map((_, block) => ({ item: itemIndex, block })));
}

function itemAt(doc: JSONContent, item: number): JSONContent {
  const found = doc.content?.[0]?.content?.[item];
  if (!found) throw new Error("No item");
  return found;
}

describe("edits to the blocks inside list items", () => {
  it.each(shapes)("should save Markdown that reads back as the edit when a block of an item in %j is removed or a paragraph is added", (markdown) => {
    for (const { item, block } of itemBlocks(reloaded(markdown))) {
      if (block > 0) expectShownAsEdited(editAndSave(markdown, (doc) => { itemAt(doc, item).content?.splice(block, 1); }));
      expectShownAsEdited(editAndSave(markdown, (doc) => { itemAt(doc, item).content?.splice(block + 1, 0, paragraph("added")); }));
    }
  });
});
