import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { emptySourceMap, parseMarkdown, serializeMarkdown } from "../markdown-roundtrip";
import { markdownSchemaExtensions } from "../markdown-schema";
import { anchorForBlockAt } from "./block-links";
import { blockCounts, blockShape, blockTargetAt, blockTargetFrom, canMoveBlock, deleteBlock, documentBlocks, duplicateBlock, moveBlock, type BlockTarget } from "./block-target";

const schema = getSchema(markdownSchemaExtensions());

function stateOf(markdown: string): EditorState {
  return EditorState.create({ doc: schema.nodeFromJSON(parseMarkdown(markdown).doc) });
}

function markdownOf(state: EditorState): string {
  return serializeMarkdown(state.doc.toJSON() as Parameters<typeof serializeMarkdown>[0], emptySourceMap());
}

/** The block whose text starts with `text`. */
function blockWith(state: EditorState, text: string): BlockTarget {
  const found = documentBlocks(state.doc).find((block) => block.node.textContent.startsWith(text));
  if (!found) throw new Error(`No block starts with ${text}`);
  return found;
}

function run(state: EditorState, tr: ReturnType<typeof deleteBlock> | null): EditorState {
  if (!tr) throw new Error("No transaction");
  return state.apply(tr);
}

const doc = "# Title\n\nFirst paragraph.\n\n- one\n- two\n  - nested\n- three\n\nLast paragraph.\n";

describe("blockTargetAt", () => {
  it("should find the top-level block when the position is in a paragraph", () => {
    const state = stateOf(doc);
    const target = blockTargetAt(state.doc, blockWith(state, "First").pos + 3);
    expect(target?.node.textContent).toBe("First paragraph.");
    expect(target?.item).toBe(false);
  });

  it("should find the innermost list item when the position is inside a nested list", () => {
    const state = stateOf(doc);
    const nested = blockWith(state, "nested");
    const target = blockTargetAt(state.doc, nested.pos + 3);
    expect(target?.item).toBe(true);
    expect(target?.node.textContent).toBe("nested");
  });

  it("should find the block after a position between top-level blocks", () => {
    const state = stateOf(doc);
    expect(blockTargetAt(state.doc, 0)?.node.type.name).toBe("heading");
  });
});

describe("documentBlocks", () => {
  it("should list top-level blocks that are not lists, then every list item, in order", () => {
    const names = documentBlocks(stateOf(doc).doc).map((block) => block.node.textContent);
    expect(names).toEqual(["Title", "First paragraph.", "one", "twonested", "nested", "three", "Last paragraph."]);
  });
});

describe("moveBlock", () => {
  it("should swap a top-level block with the one above when moving up", () => {
    const state = stateOf(doc);
    const next = run(state, moveBlock(state, blockWith(state, "First"), -1));
    expect(markdownOf(next)).toBe("First paragraph.\n\n# Title\n\n- one\n- two\n  - nested\n- three\n\nLast paragraph.\n");
  });

  it("should move a list item with its nested items within its list when moving down", () => {
    const state = stateOf(doc);
    const next = run(state, moveBlock(state, blockWith(state, "twonested"), 1));
    expect(markdownOf(next)).toContain("- one\n- three\n- two\n  - nested\n");
  });

  it("should do nothing when the block is already first or last among its siblings", () => {
    const state = stateOf(doc);
    expect(moveBlock(state, blockWith(state, "Title"), -1)).toBeNull();
    expect(moveBlock(state, blockWith(state, "Last"), 1)).toBeNull();
    expect(canMoveBlock(state.doc, blockWith(state, "nested"), 1)).toBe(false);
  });

  it("should keep the cursor in the moved block when it was there", () => {
    const base = stateOf(doc);
    const first = blockWith(base, "First");
    const state = base.apply(base.tr.setSelection(TextSelection.create(base.doc, first.pos + 4)));
    const next = run(state, moveBlock(state, blockWith(state, "First"), -1));
    expect(next.selection.$from.parent.textContent).toBe("First paragraph.");
    expect(next.selection.from).toBe(4);
  });
});

describe("duplicateBlock", () => {
  it("should put a copy right after the block when duplicating", () => {
    const state = stateOf(doc);
    const next = state.apply(duplicateBlock(state, blockWith(state, "First")));
    expect(markdownOf(next)).toContain("First paragraph.\n\nFirst paragraph.\n\n- one");
  });

  it("should copy a list item as an item when duplicating inside a list", () => {
    const state = stateOf(doc);
    const next = state.apply(duplicateBlock(state, blockWith(state, "one")));
    expect(markdownOf(next)).toContain("- one\n- one\n- two");
  });
});

describe("deleteBlock", () => {
  it("should remove only the block when deleting", () => {
    const state = stateOf(doc);
    const next = state.apply(deleteBlock(state, blockWith(state, "First")));
    expect(markdownOf(next)).toBe("# Title\n\n- one\n- two\n  - nested\n- three\n\nLast paragraph.\n");
  });

  it("should remove an item, or its whole list when it is the only item", () => {
    const state = stateOf(doc);
    expect(markdownOf(state.apply(deleteBlock(state, blockWith(state, "three"))))).toContain("- one\n- two\n  - nested\n\nLast");
    const nestedGone = state.apply(deleteBlock(state, blockWith(state, "nested")));
    expect(markdownOf(nestedGone)).toContain("- one\n- two\n- three");
    const single = stateOf("Intro\n\n- only\n");
    expect(markdownOf(single.apply(deleteBlock(single, blockWith(single, "only"))))).toBe("Intro\n");
  });

  it("should leave an empty paragraph when the last block goes", () => {
    const state = stateOf("Only line\n");
    const next = state.apply(deleteBlock(state, blockWith(state, "Only")));
    expect(next.doc.childCount).toBe(1);
    expect(next.doc.firstChild?.type.name).toBe("paragraph");
    expect(next.doc.textContent).toBe("");
  });
});

describe("blockShape and blockCounts", () => {
  it("should describe headings by level and list items by their list", () => {
    const state = stateOf("## Sub\n\n1. step\n\n- [ ] task\n");
    expect(blockShape(state.doc, blockWith(state, "Sub"))).toEqual({ node: "heading", level: 2, list: undefined });
    expect(blockShape(state.doc, blockWith(state, "step")).list).toBe("orderedList");
    expect(blockShape(state.doc, blockWith(state, "task")).list).toBe("taskList");
  });

  it("should count words and characters when a block has text", () => {
    const state = stateOf(doc);
    expect(blockCounts(blockWith(state, "First").node)).toEqual({ words: 2, characters: 16 });
    expect(blockCounts(blockWith(state, "twonested").node)).toEqual({ words: 2, characters: 9 });
  });
});

describe("blockTargetFrom", () => {
  it("should find a block by where it starts, and nothing inside a block", () => {
    const state = stateOf(doc);
    const first = blockWith(state, "First");
    expect(blockTargetFrom(state.doc, first.pos)?.node.textContent).toBe("First paragraph.");
    expect(blockTargetFrom(state.doc, first.pos + 1)).toBeNull();
    expect(blockTargetFrom(state.doc, -1)).toBeNull();
  });
});

describe("anchorForBlockAt", () => {
  it("should name a block by its opening words and say which repeat it is", () => {
    const state = stateOf("Same start here\n\nSame start here\n");
    const [, second] = documentBlocks(state.doc);
    expect(second ? anchorForBlockAt(state.doc, second.pos) : null).toEqual({ kind: "words", words: "Same start here", nth: 2 });
  });

  it("should name a media block by its file", () => {
    const file = "0f8fad5b-d9cb-469f-a165-70867728950e";
    const state = stateOf(`Intro\n\n![Chart](/api/files/${file})\n`);
    const media = documentBlocks(state.doc).find((block) => block.node.type.name === "media");
    expect(media ? anchorForBlockAt(state.doc, media.pos) : null).toEqual({ kind: "file", fileId: file });
  });
});
