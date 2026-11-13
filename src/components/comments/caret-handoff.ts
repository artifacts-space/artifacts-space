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

/** The plain box, at the moment the rich box is ready to take it over. */
export interface PlainBoxNow {
  /** Its text. */
  text: string;
  /** The text it opened with: the comment being edited, or nothing. */
  opening: string;
  /** Whether it has the caret. */
  focused: boolean;
}

/** A space, tab, or line break typed last: Markdown drops it when the text is read, so the next word would join the last. */
const TYPED_TAIL = /[ \t\n]$/;

/**
 * Whether the rich box takes over from the plain box now, or waits. It never
 * takes over while someone is typing: only when the plain box does not have
 * the caret, is empty, or still holds just the text it opened with. Nor while
 * the text ends in a space, tab, or line break, which the rich box would drop.
 * Until then the plain box stays; a post or a cleared box always swaps.
 */
export function takesOverNow({ text, opening, focused }: PlainBoxNow): boolean {
  if (TYPED_TAIL.test(text)) return false;
  return !focused || text === "" || text === opening;
}
