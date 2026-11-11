import { getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { emptySourceMap, parseMarkdown, serializeMarkdown } from "../markdown-roundtrip";
import { markdownSchemaExtensions } from "../markdown-schema";
import { blockColors, colorBlock, colorLines } from "./block-color";
import { documentBlocks, type BlockTarget } from "./block-target";

const schema = getSchema(markdownSchemaExtensions());

function stateOf(markdown: string): EditorState {
  return EditorState.create({ doc: schema.nodeFromJSON(parseMarkdown(markdown).doc) });
}

function markdownOf(state: EditorState): string {
  return serializeMarkdown(state.doc.toJSON() as Parameters<typeof serializeMarkdown>[0], emptySourceMap());
}

/** The block of `type` whose text starts with `text`. */
function blockOf(state: EditorState, type: string, text: string): BlockTarget {
  const found = documentBlocks(state.doc).find((block) => block.node.type.name === type && block.node.textContent.startsWith(text));
  if (!found) throw new Error(`No ${type} starts with ${text}`);
  return found;
}

function colored(state: EditorState, target: BlockTarget, part: "color" | "background", hue: "red" | "blue" | null): EditorState {
  const tr = colorBlock(state, target, part, hue);
  if (!tr) throw new Error("No transaction");
  return state.apply(tr);
}

describe("colorBlock", () => {
  it("should write a color comment after a paragraph's text when coloring it", () => {
    const state = stateOf("First line.\n\nSecond line.\n");
    const next = colored(state, blockOf(state, "paragraph", "Second"), "color", "red");
    expect(markdownOf(next)).toBe("First line.\n\nSecond line. <!-- color: red -->\n");
  });

  it("should keep the other part and remove a part set back to Default", () => {
    const state = stateOf("## Status <!-- color: red; background: blue -->\n");
    const target = blockOf(state, "heading", "Status");
    expect(blockColors(state.doc, target)).toEqual({ color: "red", background: "blue" });
    expect(markdownOf(colored(state, target, "color", null))).toBe("## Status <!-- background: blue -->\n");
  });

  it("should color a list item's own line, not the items under it", () => {
    const state = stateOf("- parent\n  - child\n- sibling\n");
    const next = colored(state, blockOf(state, "listItem", "parent"), "background", "blue");
    expect(markdownOf(next)).toBe("- parent <!-- background: blue -->\n  - child\n- sibling\n");
  });

  it("should color every line in a quote", () => {
    const state = stateOf("> one\n>\n> two\n");
    const next = colored(state, blockOf(state, "blockquote", "one"), "color", "blue");
    expect(markdownOf(next)).toBe("> one <!-- color: blue -->\n>\n> two <!-- color: blue -->\n");
  });

  it("should offer no Color for code, dividers, and tables", () => {
    const state = stateOf("```\ncode\n```\n\n---\n\n| a |\n| --- |\n| b |\n");
    for (const block of documentBlocks(state.doc)) {
      expect(colorLines(block)).toEqual([]);
      expect(colorBlock(state, block, "color", "red")).toBeNull();
    }
  });
});
