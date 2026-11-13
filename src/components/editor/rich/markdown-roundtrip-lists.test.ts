import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { edit, editAndSave, find, paragraph, reloaded, tick } from "./list-edit-helpers";
import { readsTheSame } from "./markdown-display-shape";
import { parseMarkdown, serializeMarkdown, type SourceMap } from "./markdown-roundtrip";
import { checkedListRuns, listChunk, type ListTools } from "./markdown-roundtrip-lists";

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

  it("should read a box with no text after it as an empty task, as the read view's brackets", () => {
    expect(blocks("- [ ] one\n- [ ]\n- [x] three\n")).toEqual(["taskList:3"]);
    expect(blocks("- [ ] one\n\n- [ ] \n")).toEqual(["taskList:2"]);
    const saved = edit("* [ ] one\n* [x] two\n", (doc) => {
      doc.content?.[0]?.content?.splice(1, 0, { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", attrs: { color: null, background: null } }] });
    });
    // The other items keep their marker: an empty task does not send the list to a fresh write.
    expect(saved).toBe("* [ ] one\n* [ ] \n* [x] two\n");
    expect(blocks(saved)).toEqual(["taskList:3"]);
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

  it("should save lists that read back as the edit when an item with no text yet is added to one of them", () => {
    const markdown = "- alpha\n- [ ] one\n- [x] two\n\n  | name | value |\n  | --- | --- |\n  | a | b |\n\nAfter.\n";
    const { doc, saved } = editAndSave(markdown, (edited) => {
      edited.content?.[0]?.content?.unshift({ type: "listItem", content: [{ type: "paragraph", attrs: { color: null, background: null } }] });
    });
    expect(parseMarkdown(saved).rawBlocks).toBe(0);
    expect(reloaded(saved)).toEqual(doc);
    expect(readsTheSame(saved, reloaded(saved).content ?? [])).toBe(true);
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

describe("the last resort", () => {
  const key = (node: JSONContent) => JSON.stringify(node);
  /** The round trip's tools with a reader that reads nothing back, so no writing of a list is sound. */
  const unreadable: ListTools = {
    key,
    parse: () => null,
    canonical: (nodes) => nodes,
    write: (node) => (node.type === "paragraph" ? (node.content ?? []).map((child) => child.text ?? "").join("") : `<${String(node.type)}>`),
    load: (text) => parseMarkdown(text),
    save: (content, map) => serializeMarkdown({ type: "doc", content }, map),
  };

  function edited(markdown: string): { nodes: JSONContent[]; source: SourceMap } {
    const loaded = parseMarkdown(markdown);
    const nodes = structuredClone(loaded.doc.content ?? []);
    nodes[0]?.content?.push({ type: "listItem", content: [paragraph("added")] });
    return { nodes, source: loaded.source };
  }

  it("should keep an edited list as it was loaded when no writing of it reads back the same", () => {
    const { nodes, source } = edited("* one\n* two\n");
    expect(listChunk(nodes, 0, source, -1, new Set(), unreadable)).toEqual({ text: "* one\n* two", block: 0 });
  });

  it("should save the words of a list with nothing loaded as blocks of their own when no writing of it reads back the same", () => {
    const list: JSONContent = { type: "bulletList", content: [{ type: "listItem", content: [paragraph("one"), { type: "bulletList", content: [{ type: "listItem", content: [paragraph("two")] }] }] }] };
    const empty: SourceMap = { original: "", leading: "", blocks: [], endsWithNewline: true };
    expect(listChunk([list], 0, empty, -1, new Set(), unreadable)).toEqual({ text: "one\n\ntwo", block: -1 });
  });

  it("should keep lists that follow each other as they were loaded when together they read back differently", () => {
    const loaded = parseMarkdown("Before.\n\n- plain\n- [ ] task\n\nAfter.\n");
    const [before, plain, task, after] = loaded.doc.content ?? [];
    const chunks = [
      { text: "Before.", block: 0, nodes: before ? [before] : [] },
      { text: "- plain\n- more", block: -1, nodes: plain ? [plain] : [] },
      { text: "- [ ] task", block: -1, nodes: task ? [task] : [] },
      { text: "After.", block: 2, nodes: after ? [after] : [] },
    ];
    expect(checkedListRuns(chunks, loaded.source, unreadable).map((chunk) => [chunk.text, chunk.block])).toEqual([["Before.", 0], ["- plain\n- [ ] task", 1], ["After.", 2]]);
  });

  it("should leave a run of loaded lists alone when nobody edited them", () => {
    const loaded = parseMarkdown("* one\n\n- two\n");
    const chunks = (loaded.doc.content ?? []).map((node, block) => ({ text: loaded.source.blocks[block]?.text ?? "", block, nodes: [node] }));
    expect(checkedListRuns(chunks, loaded.source, unreadable)).toEqual(chunks);
  });
});
