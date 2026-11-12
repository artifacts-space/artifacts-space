import { describe, expect, it } from "vitest";

import { edit, find, setText } from "./list-edit-helpers";
import { mayReadDifferently, readsTheSame } from "./markdown-display-shape";
import { parseMarkdown } from "./markdown-roundtrip";

describe("lists the read view reads differently", () => {
  it("should keep numbered task items as written, boxes and all, when a document has them", () => {
    const markdown = "# Steps\n\n1. [ ] a\n2. [x] b\n";
    const loaded = parseMarkdown(markdown);
    expect(loaded.rawBlocks).toBe(1);
    expect(loaded.rawKinds).toEqual(["other"]);
    expect(edit(markdown, (doc) => { setText(find(doc, "heading", "Steps"), "Next steps"); })).toBe("# Next steps\n\n1. [ ] a\n2. [x] b\n");
  });

  it("should keep a numbered list as written when its first item is empty", () => {
    expect(parseMarkdown("1. \n2. b\n").rawBlocks).toBe(1);
  });

  it("should format a bulleted list with an empty item in the middle", () => {
    expect(parseMarkdown("- a\n-\n- c\n").rawBlocks).toBe(0);
  });

  it("should keep the list as written when a line under an item is read as text by the read view", () => {
    expect(parseMarkdown("1. a\n    2. b\n").rawBlocks).toBe(1);
    expect(parseMarkdown("1.     code\n2. b\n").rawBlocks).toBe(1);
  });

  it("should keep the list as written when a number other than 1 starts on the line after an item's text", () => {
    // CommonMark lets only 1 start a list inside a paragraph, so the read view reads "3) c" as text.
    expect(parseMarkdown("1. a\n\n   more\n   3) c\n").rawBlocks).toBe(1);
    expect(parseMarkdown("- a\n  9. b\n").rawBlocks).toBe(1);
    expect(parseMarkdown("1. a\n2. b\n   continues\n3. c\n").rawBlocks).toBe(0);
  });

  it("should format numbered steps with nested lists without asking the read view", () => {
    const markdown = "1. a\n   - sub\n     - deep\n2. b\n   1. one\n   2. two\n3. c\n";
    expect(mayReadDifferently(markdown)).toBe(false);
    expect(parseMarkdown(markdown).rawBlocks).toBe(0);
    expect(readsTheSame(markdown, parseMarkdown(markdown).doc.content ?? [])).toBe(true);
    // A number set further in than the item above it sits inside that item's text.
    expect(mayReadDifferently("- a\n  2. b\n")).toBe(true);
  });

  it("should keep the task box when a bulleted list has a task item after a plain one", () => {
    const loaded = parseMarkdown("- plain\n- [x] task\n");
    expect(loaded.rawBlocks).toBe(0);
    expect(loaded.doc.content?.map((node) => node.type)).toEqual(["bulletList", "taskList"]);
    expect(loaded.doc.content?.[1]?.content?.[0]?.attrs?.checked).toBe(true);
  });

  it("should format task items that hold code blocks without asking the read view", () => {
    const markdown = "- [ ] **2. Save.** Paste:\n\n  ```text\n  Save \"this\".\n  ```\n\n  Expect: a link.\n\n- [ ] **Show it.** Open it.\n";
    expect(mayReadDifferently(markdown)).toBe(false);
    expect(parseMarkdown(markdown).rawBlocks).toBe(0);
  });
});

describe("readsTheSame", () => {
  it("should match when the read view shows the same list, boxes, and text", () => {
    const markdown = "- [ ] a\n\n  ```sh\n  x\n  ```\n- [x] **b**\n";
    expect(readsTheSame(markdown, parseMarkdown(markdown).doc.content ?? [])).toBe(true);
  });

  it("should not match when the read view shows text where the editor holds a list", () => {
    expect(readsTheSame("Intro\n2. b\n", parseMarkdown("Intro\n\n2. b\n").doc.content ?? [])).toBe(false);
  });
});
