import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";

import { noBlockColors, readBlockColors, type BlockColorPart, type BlockColors, type BlockHue } from "@/lib/block-colors/block-color-rules";

import { colorableNodes } from "../block-color-nodes";
import { isListItem, type BlockTarget } from "./block-target";

/*
 * Color in the block menu: the lines of text a block's colors go on. A
 * paragraph or heading is its own line; a list item colors its own lines
 * (not the items nested under it); a quote colors every line in it. Code,
 * tables, dividers, media, and raw blocks have no Color.
 */

/** The positions of the paragraphs and headings that Color changes for `target`. */
export function colorLines(target: BlockTarget): number[] {
  const { node, pos } = target;
  if (colorableNodes.has(node.type.name)) return [pos];
  const lines: number[] = [];
  if (isListItem(node)) {
    node.forEach((child, offset) => {
      if (colorableNodes.has(child.type.name)) lines.push(pos + 1 + offset);
    });
    return lines;
  }
  if (node.type.name !== "blockquote") return lines;
  node.descendants((child, offset) => {
    if (colorableNodes.has(child.type.name)) lines.push(pos + 1 + offset);
    return !child.isTextblock;
  });
  return lines;
}

/** The block's colors: those of its first line, or none. */
export function blockColors(doc: PMNode, target: BlockTarget): BlockColors {
  const [first] = colorLines(target);
  if (first === undefined) return noBlockColors;
  return readBlockColors(doc.nodeAt(first)?.attrs);
}

/** Sets one part of the block's colors on every line of it, as one step of Undo. Null when the block has no lines to color. */
export function colorBlock(state: EditorState, target: BlockTarget, part: BlockColorPart, hue: BlockHue | null): Transaction | null {
  const lines = colorLines(target);
  if (lines.length === 0) return null;
  const tr = state.tr;
  for (const pos of lines) tr.setNodeAttribute(pos, part, hue);
  return tr;
}
