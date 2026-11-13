import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { edit, editAndSave, editBothWays, find, paragraph, reloaded, setText, tick } from "./list-edit-helpers";
import { readsTheSame } from "./markdown-display-shape";
import { emptySourceMap, parseMarkdown, serializeMarkdown } from "./markdown-roundtrip";

const emptyParagraph = (): JSONContent => ({ type: "paragraph", attrs: { color: null, background: null } });
const item = (...content: JSONContent[]): JSONContent => ({ type: "listItem", content });

/** A document's blocks by type, with the item count of each list. */
function blocks(markdown: string): string[] {
  return (parseMarkdown(markdown).doc.content ?? []).map((node) => (node.type?.endsWith("List") ? `${node.type}:${String(node.content?.length)}` : (node.type ?? "")));
}

/** Steps as an agent writes them: task items set apart by blank lines, some holding a code block and a paragraph. */
const steps = [
  "- [ ] **1. Connect.** Add the plugin.",
  "",
  "- [ ] **2. Save.** Paste:",
  "",
  "  ```text",
  "  Save this.",
  "  ```",
  "",
  "  Expect: a link.",
  "",
  "- [ ] **Show it landed.** Open the tab.",
  "",
  "- [ ] Stop the recording.",
  "",
].join("\n");

describe("a loose task list", () => {
  it("should load as one task list when its items are set apart by blank lines and hold several blocks", () => {
    expect(blocks(steps)).toEqual(["taskList:4"]);
    expect(parseMarkdown(steps).rawBlocks).toBe(0);
    expect(readsTheSame(steps, parseMarkdown(steps).doc.content ?? [])).toBe(true);
  });

  it("should save the same text when nothing is edited", () => {
    expect(edit(steps, () => undefined)).toBe(steps);
  });

  it("should change one character when a box in the middle is ticked", () => {
    expect(edit(steps, (doc) => { tick(doc, "2. Save."); })).toBe(steps.replace("- [ ] **2. Save.**", "- [x] **2. Save.**"));
  });

  it("should put nothing but the new item between items when one is added", () => {
    const saved = edit(steps, (doc) => {
      doc.content?.[0]?.content?.splice(3, 0, { type: "taskItem", attrs: { checked: false }, content: [paragraph("New step.")] });
    });
    expect(saved).toBe(steps.replace("- [ ] Stop the recording.", "- [ ] New step.\n\n- [ ] Stop the recording."));
  });

  it("should move an item with its blocks and leave the others as written when an item changes place", () => {
    const { doc, saved } = editAndSave(steps, (edited) => {
      const items = edited.content?.[0]?.content ?? [];
      const [moved] = items.splice(1, 1);
      if (moved) items.push(moved);
    });
    expect(saved).toBe([
      "- [ ] **1. Connect.** Add the plugin.",
      "",
      "- [ ] **Show it landed.** Open the tab.",
      "",
      "- [ ] Stop the recording.",
      "",
      "- [ ] **2. Save.** Paste:",
      "",
      "  ```text",
      "  Save this.",
      "  ```",
      "",
      "  Expect: a link.",
      "",
    ].join("\n"));
    expect(reloaded(saved)).toEqual(doc);
  });

  it("should read a box with nothing after it as an item with the text [ ], as the page shows it", () => {
    const loaded = parseMarkdown("- [ ] one\n- [ ]\n- [x] three\n");
    expect(loaded.rawBlocks).toBe(0);
    expect(blocks("- [ ] one\n- [ ]\n- [x] three\n")).toEqual(["taskList:1", "bulletList:1", "taskList:1"]);
    expect(find(loaded.doc, "listItem", "[ ]").content?.[0]?.content?.[0]?.text).toBe("[ ]");
    expect(readsTheSame("- [ ] one\n- [ ]\n- [x] three\n", loaded.doc.content ?? [])).toBe(true);
  });
});

describe("task and plain items in one Markdown list", () => {
  it("should load as a task list and a bulleted list in the order written", () => {
    expect(blocks("- [ ] task\n- plain\n- [x] done\n")).toEqual(["taskList:1", "bulletList:1", "taskList:1"]);
    expect(parseMarkdown("- [ ] task\n- plain\n- [x] done\n").rawBlocks).toBe(0);
  });

  it("should keep every line of a task item's text when the list also holds plain items", () => {
    const loaded = parseMarkdown("- plain\n- [ ] first line\n  second line\n");
    expect(loaded.rawBlocks).toBe(0);
    expect(find(loaded.doc, "taskItem", "first line").content?.[0]?.content?.map((node) => node.text).join("")).toContain("second line");
  });

  it("should save a ticked box as the round trip's own writer does when the list also holds plain items", () => {
    const { saved, whole } = editBothWays("- [ ] task\n- plain\n- [x] done\n", (doc) => { tick(doc, "task"); });
    expect(saved).toBe(whole);
    expect(blocks(saved)).toEqual(["taskList:1", "bulletList:1", "taskList:1"]);
  });
});

describe("seed 1595 of the generated lists", () => {
  // A task list two lists deep, where the last task holds a second paragraph and a code block follows the list.
  const markdown = [
    "* alpha 0",
    "",
    "  - [x] see `code` 0",
    "  - [ ] Q&A 1",
    "  - [ ] **bold** text 2",
    "",
    "    ```sh",
    "    x = 1",
    "    ```",
    "  - [x] Q&A 3",
    "",
    "    beta more",
    "",
    "  ```text",
    "  - not a list",
    "  ```",
    "* gamma 1",
    "  ```sh",
    "  - not a list",
    "  ```",
    "",
  ].join("\n");

  it("should read a second paragraph in a nested task item as a paragraph", () => {
    const loaded = parseMarkdown("* alpha\n\n  - [x] task\n\n    more\n");
    expect(loaded.rawBlocks).toBe(0);
    expect(find(loaded.doc, "taskItem", "task").content?.map((node) => node.type)).toEqual(["paragraph", "paragraph"]);
  });

  it("should save a list that reads back as the edit, and leave every other line as written, when the third task is removed", () => {
    const { doc, saved } = editAndSave(markdown, (edited) => {
      find(edited, "taskList", "bold").content?.splice(2, 1);
    });
    expect(saved).toBe(markdown.replace("  - [ ] **bold** text 2\n\n    ```sh\n    x = 1\n    ```\n", ""));
    expect(parseMarkdown(saved).rawBlocks).toBe(0);
    expect(reloaded(saved)).toEqual(doc);
    expect(readsTheSame(saved, reloaded(saved).content ?? [])).toBe(true);
  });
});

describe("numbered items", () => {
  it("should load formatted when an item holds bold text, a link, or code", () => {
    const loaded = parseMarkdown("1. **Ship** it.\n2. Read [the docs](https://example.com).\n3. Run `pnpm test`.\n");
    expect(loaded.rawBlocks).toBe(0);
    expect(blocks("1. **Ship** it.\n2. Read [the docs](https://example.com).\n3. Run `pnpm test`.\n")).toEqual(["orderedList:3"]);
    expect(find(loaded.doc, "paragraph", "Ship").content?.[0]).toMatchObject({ text: "Ship", marks: [{ type: "bold" }] });
  });

  it("should keep its numbers when a new numbered list is saved", () => {
    const list: JSONContent = { type: "orderedList", attrs: { start: 1 }, content: [item(paragraph("one")), item(paragraph("two")), item(paragraph("three"))] };
    const saved = serializeMarkdown({ type: "doc", content: [list] }, emptySourceMap());
    expect(saved).toBe("1. one\n2. two\n3. three\n");
    expect(blocks(saved)).toEqual(["orderedList:3"]);
  });
});

/*
 * An edited list is saved over its loaded items when that reads back as the
 * edit, and otherwise exactly as the round trip's own writer saves the whole
 * list (`whole` below). No other text is ever saved, so nothing can reach
 * back to how the list was loaded: both ways write the content as it is now.
 */
describe("the two ways an edited list is saved", () => {
  it("should keep an earlier edit when a later one ends an item with a space", () => {
    const { saved } = editBothWays("* alpha\n* beta\n* gamma\n", (doc) => {
      setText(find(doc, "paragraph", "alpha"), "ALPHA rewritten");
      setText(find(doc, "paragraph", "gamma"), "gamma ");
    });
    expect(saved).toBe("* ALPHA rewritten\n* beta\n* gamma \n");
    expect(blocks(saved)).toEqual(["bulletList:3"]);
  });

  it("should change only the item when a space is typed at its end", () => {
    const { saved } = editBothWays("* alpha\n* beta\n", (doc) => { setText(find(doc, "paragraph", "alpha"), "alpha "); });
    expect(saved).toBe("* alpha \n* beta\n");
    expect(blocks(saved)).toEqual(["bulletList:2"]);
  });

  it("should keep a new list a list when its item ends with a space", () => {
    const saved = serializeMarkdown({ type: "doc", content: [{ type: "bulletList", content: [item(paragraph("Buy milk "))] }] }, emptySourceMap());
    expect(blocks(saved)).toEqual(["bulletList:1"]);
    expect(find(reloaded(saved), "paragraph", "Buy").content?.[0]?.text).toBe("Buy milk");
  });

  it("should save the whole list as the round trip's own writer does when an item is moved under an empty item", () => {
    const { saved, whole } = editBothWays("* a\n*\n* c\n", (doc) => {
      const items = doc.content?.[0]?.content ?? [];
      const [moved] = items.splice(2, 1);
      if (moved) items[1]?.content?.push({ type: "bulletList", content: [moved] });
    });
    expect(saved).toBe(whole);
    expect(saved).toBe("- a\n- \n  - c\n");
  });

  it("should store what is typed in a child of an empty item", () => {
    const { saved, whole } = editBothWays("* a\n* b\n", (doc) => {
      doc.content?.[0]?.content?.push(item(emptyParagraph(), { type: "bulletList", content: [item(paragraph("typed"))] }));
    });
    expect(saved).toBe(whole);
    expect(saved).toBe("- a\n- b\n- \n  - typed\n");
  });

  it("should save the whole list as the round trip's own writer does when the first numbered item is emptied", () => {
    const { saved, whole } = editBothWays("1) a\n2) b\n", (doc) => { find(doc, "paragraph", "a").content = []; });
    expect(saved).toBe(whole);
    expect(saved).toBe("1. \n2. b\n");
  });

  it("should save the whole list as the round trip's own writer does when a task with no text yet is added", () => {
    const { saved, whole } = editBothWays("* [ ] one\n* [x] two\n", (doc) => {
      doc.content?.[0]?.content?.splice(1, 0, { type: "taskItem", attrs: { checked: false }, content: [emptyParagraph()] });
    });
    expect(saved).toBe(whole);
  });

  it("should write the item over its source again when the task gets its text", () => {
    const loaded = parseMarkdown("* [ ] one\n* [x] two\n");
    const doc = structuredClone(loaded.doc);
    doc.content?.[0]?.content?.splice(1, 0, { type: "taskItem", attrs: { checked: false }, content: [emptyParagraph()] });
    serializeMarkdown(doc, loaded.source);
    const added = doc.content?.[0]?.content?.[1]?.content?.[0];
    if (added) setText(added, "between");
    expect(serializeMarkdown(doc, loaded.source)).toBe("* [ ] one\n* [ ] between\n* [x] two\n");
  });

  it("should save a list that loads formatted again when a line after a line break starts with spaces", () => {
    const markdown = "* top\n  - [x] gamma\n\n    more\n* last\n";
    const { saved } = editBothWays(markdown, (doc) => {
      const text = find(doc, "paragraph", "gamma");
      text.content = [...(text.content ?? []), { type: "hardBreak" }, { type: "text", text: "  edited" }];
    });
    // The line is stored without the spaces it starts with: with them, the list would load as written the next time.
    expect(saved).toBe("* top\n  - [x] gamma  \n    edited\n\n    more\n* last\n");
    expect(parseMarkdown(saved).rawBlocks).toBe(0);
    expect(find(reloaded(saved), "paragraph", "gamma").content?.map((node) => node.text ?? "/")).toEqual(["gamma", "/", "edited"]);
  });

  it("should keep the spaces that end an item's first line when a block under it is edited", () => {
    const markdown = "* top  \n  - [x] gamma\n* last\n";
    const { saved } = editBothWays(markdown, (doc) => { setText(find(doc, "paragraph", "gamma"), "gamma ray"); });
    expect(saved).toBe("* top  \n  - [x] gamma ray\n* last\n");
  });

  it("should load a list formatted again after an item beside a table item is removed", () => {
    const markdown = "- first\n\n  more\n\n- step\n\n  | name | value |\n  | --- | --- |\n  | a | b |\n\n  after\n";
    const { doc, saved } = editAndSave(markdown, (edited) => { edited.content?.[0]?.content?.splice(0, 1); });
    expect(parseMarkdown(saved).rawBlocks).toBe(0);
    expect(reloaded(saved)).toEqual(doc);
  });
});
