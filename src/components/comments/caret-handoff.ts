import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

interface Textblock {
  /** Where the block's text starts. */
  start: number;
  size: number;
}

function textblocks(doc: ProseMirrorNode): Textblock[] {
  const blocks: Textblock[] = [];
  doc.descendants((node, position) => {
    if (!node.isTextblock) return true;
    blocks.push({ start: position + 1, size: node.content.size });
    return false;
  });
  return blocks;
}

/**
 * Where a caret in the plain box's text lands in the rich box's document,
 * when the rich box takes over from the plain one. Plain text maps exactly:
 * a blank line between paragraphs is the gap between two blocks, and a
 * single line break stays inside its paragraph. Text with Markdown marks
 * lands near the same place; past the end it lands at the end.
 */
export function positionForOffset(doc: ProseMirrorNode, offset: number): number {
  let remaining = Math.max(0, offset);
  let end = 1;
  for (const block of textblocks(doc)) {
    if (remaining <= block.size) return block.start + remaining;
    // The blank line between this block and the next.
    remaining = Math.max(0, remaining - block.size - 2);
    end = block.start + block.size;
  }
  return end;
}
