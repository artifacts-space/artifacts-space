import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { splitListItems } from "./markdown-list-items";
import { parseMarkdown, serializeMarkdown } from "./markdown-roundtrip";

/** Loads Markdown, applies one change to the editor content, and saves. */
function edit(markdown: string, change: (doc: JSONContent) => void): string {
  const loaded = parseMarkdown(markdown);
  const doc = structuredClone(loaded.doc);
  change(doc);
  return serializeMarkdown(doc, loaded.source);
}

/** Every node in document order. */
function nodes(node: JSONContent): JSONContent[] {
  return [node, ...(node.content ?? []).flatMap((child) => nodes(child))];
}

function textOf(node: JSONContent): string {
  return nodes(node).map((child) => child.text ?? "").join("");
}

/** The first node of `type` whose text includes `words`. */
function find(doc: JSONContent, type: string, words: string): JSONContent {
  const found = nodes(doc).find((node) => node.type === type && textOf(node).includes(words));
  if (!found) throw new Error(`No ${type} with "${words}"`);
  return found;
}

function setText(node: JSONContent, text: string) {
  node.content = [{ type: "text", text }];
}

function tick(doc: JSONContent, words: string, checked = true) {
  const item = find(doc, "taskItem", words);
  item.attrs = { ...item.attrs, checked };
}

/** The owner's case: task items that hold a paragraph, a code block, and another paragraph, with blank lines. */
const taskItemsWithCode = [
  "## Record",
  "",
  "- [ ] **1. Connect** (about 20 seconds). Add the plugin.",
  "",
  "- [ ] **2. Save a new artifact in a project.** Paste:",
  "",
  "  ```text",
  "  Save this as an artifact in my Launch project: \"Launch plan: ship beta on Friday.\"",
  "  ```",
  "",
  "  Expect: a new private artifact, with a link.",
  "",
  "- [ ] **Show it landed.** Switch to the artifacts.space tab.",
  "",
  "- [ ] Stop the recording.",
  "",
  "## After you record",
  "",
].join("\n");

describe("splitListItems", () => {
  it("should cut a loose list into items with the blank lines between them when the items hold blocks", () => {
    const items = splitListItems("- Run:\n\n  ```sh\n  pnpm i\n  ```\n\n- Next");
    expect(items?.map((item) => [item.text, item.after])).toEqual([["- Run:\n\n  ```sh\n  pnpm i\n  ```", "\n\n"], ["- Next", ""]]);
    expect(items?.[0]?.content).toBe("Run:\n\n```sh\npnpm i\n```");
  });

  it("should keep the task box in the marker when an item is a task", () => {
    const [item] = splitListItems("* [X] done") ?? [];
    expect(item).toMatchObject({ marker: "* [X] ", indent: 2, content: "done", box: 3 });
  });

  it("should use the marker's width as the indent when a numbered item has blocks", () => {
    const [item] = splitListItems("10. Step:\n\n    ```sh\n    x\n    ```") ?? [];
    expect(item).toMatchObject({ marker: "10. ", indent: 4, content: "Step:\n\n```sh\nx\n```" });
  });

  it("should return null when an item is indented with tabs", () => {
    expect(splitListItems("- a\n\t- b")).toBeNull();
  });
});

describe("lists whose items hold blocks", () => {
  it("should load task items with code blocks as formatted blocks when they are written with blank lines", () => {
    expect(parseMarkdown(taskItemsWithCode).rawBlocks).toBe(0);
    expect(find(parseMarkdown(taskItemsWithCode).doc, "taskItem", "2. Save").content?.map((child) => child.type)).toEqual(["paragraph", "codeBlock", "paragraph"]);
  });

  it("should change one character when a task box in an item with a code block is ticked", () => {
    const saved = edit(taskItemsWithCode, (doc) => { tick(doc, "2. Save"); });
    expect(saved).toBe(taskItemsWithCode.replace("- [ ] **2. Save", "- [x] **2. Save"));
  });

  it("should change one character when a box in a tight task list is ticked or cleared", () => {
    const markdown = "- [ ] Open [the docs](https://example.com/docs) and run `pnpm check`\n- [X] Done\n- [ ] Ship\n";
    expect(edit(markdown, (doc) => { tick(doc, "Ship"); })).toBe(markdown.replace("- [ ] Ship", "- [x] Ship"));
    expect(edit(markdown, (doc) => { tick(doc, "Done", false); })).toBe(markdown.replace("- [X] Done", "- [ ] Done"));
  });

  it("should change only the code line when the code block inside a task item is edited", () => {
    const saved = edit(taskItemsWithCode, (doc) => { setText(find(doc, "codeBlock", "Launch plan"), "Save this as a plan."); });
    expect(saved).toBe(taskItemsWithCode.replace(/ {2}Save this as an artifact.*\n/, "  Save this as a plan.\n"));
  });

  it("should change only that line when a paragraph after a code block in an item is edited", () => {
    const saved = edit(taskItemsWithCode, (doc) => { setText(find(doc, "paragraph", "Expect: a new"), "Expect: a link."); });
    expect(saved).toBe(taskItemsWithCode.replace("  Expect: a new private artifact, with a link.", "  Expect: a link."));
  });

  it("should load a numbered item with a code block as a formatted block when its code is indented under the number", () => {
    const markdown = "1. Install:\n\n   ```sh\n   pnpm install\n   ```\n\n2. Run it.\n";
    const loaded = parseMarkdown(markdown);
    expect(loaded.rawBlocks).toBe(0);
    expect(find(loaded.doc, "codeBlock", "pnpm").content?.[0]?.text).toBe("pnpm install");
    expect(edit(markdown, (doc) => { setText(find(doc, "paragraph", "Run it"), "Run it now."); })).toBe(markdown.replace("Run it.", "Run it now."));
  });
});

describe("edits to one list item", () => {
  it("should keep the other items' bullets and blank lines when one item of a loose star list is edited", () => {
    const markdown = "* one\n\n* two\n\n* three\n";
    expect(edit(markdown, (doc) => { setText(find(doc, "paragraph", "two"), "two, edited"); })).toBe("* one\n\n* two, edited\n\n* three\n");
  });

  it("should keep every number as written when an item of a list that numbers each item 1 is edited", () => {
    const markdown = "1. a\n1. b\n1. c\n";
    expect(edit(markdown, (doc) => { setText(find(doc, "paragraph", "b"), "bee"); })).toBe("1. a\n1. bee\n1. c\n");
  });

  it("should write a new item in the list's own marker style when an item is added", () => {
    const add = (markdown: string, after: string) => edit(markdown, (doc) => {
      const list = (doc.content ?? []).findLast((node) => node.type?.endsWith("List"));
      const last = structuredClone(list?.content?.at(-1) ?? {});
      setText(last.content?.[0] ?? {}, after);
      list?.content?.push(last);
    });
    expect(add("* one\n* two\n", "three")).toBe("* one\n* two\n* three\n");
    expect(add("1. a\n1. b\n", "c")).toBe("1. a\n1. b\n1. c\n");
    expect(add("3) a\n4) b\n", "c")).toBe("3) a\n4) b\n5) c\n");
    expect(add("- [ ] a\n\n- [x] b\n", "c")).toBe("- [ ] a\n\n- [x] b\n- [x] c\n");
  });

  it("should remove only the item's lines when an item is deleted", () => {
    const markdown = "- one\n- two\n  more of two\n- three\n";
    expect(edit(markdown, (doc) => { doc.content?.[0]?.content?.splice(1, 1); })).toBe("- one\n- three\n");
  });

  it("should change only the nested line when a nested item is edited or ticked", () => {
    const nested = "- Plan\n  1. one\n  2. two\n     - [ ] task\n- Ship\n";
    expect(edit(nested, (doc) => { setText(find(doc, "paragraph", "two"), "two, edited"); })).toBe(nested.replace("2. two", "2. two, edited"));
    expect(edit(nested, (doc) => { tick(doc, "task"); })).toBe(nested.replace("- [ ] task", "- [x] task"));
  });

  it("should keep a tight item tight when the text above its nested list is edited", () => {
    const markdown = "- [ ] parent\n  - [ ] child\n  - [x] child two\n";
    expect(edit(markdown, (doc) => { setText(find(doc, "paragraph", "parent"), "parent, edited"); })).toBe(markdown.replace("parent", "parent, edited"));
  });

  it("should keep the table as written when the text of an item that holds it is edited", () => {
    const markdown = "- Results:\n\n  | a | b |\n  | --- | --- |\n  | 1 | 2 |\n- Next\n";
    expect(edit(markdown, (doc) => { setText(find(doc, "paragraph", "Results"), "Results so far:"); })).toBe(markdown.replace("Results:", "Results so far:"));
  });
});
