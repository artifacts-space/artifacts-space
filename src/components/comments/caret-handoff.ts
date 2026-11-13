import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/** Spaces, tabs, and line breaks at the end of the plain box's text. */
const TRAILING_SPACE = /[ \t\n]+$/;
/** A blank line: the end of a paragraph. */
const BLANK_LINE = /\n[ \t]*\n/;
/** Blocks that hold typed text at the end of a document. */
const TEXT_HOLDERS = new Set(["paragraph", "heading", "codeBlock"]);
/** Of those, the ones where a typed line break stays in the block, as it does in the plain box's Markdown. */
const LINE_HOLDERS = new Set(["paragraph", "codeBlock"]);

/** The block whose text the document ends with, or null when it ends with something else (a rule, an image, Markdown kept as written). */
function endTextblock(doc: JSONContent): JSONContent | null {
  let node = doc;
  for (;;) {
    const last = node.content?.at(-1);
    if (!last) return null;
    if (last.type && TEXT_HOLDERS.has(last.type)) return last;
    if (last.type === "text") return null;
    node = last;
  }
}

/**
 * The plain box's text without the spaces and line breaks typed at its end:
 * what the rich box reads as Markdown. withTypedTail then puts them back as
 * text, so the Markdown map does not keep them a second time.
 */
export function withoutTypedTail(markdown: string): string {
  return markdown.replace(TRAILING_SPACE, "");
}

/** The block that keeps the typed tail as its own text, or null when the tail starts a new paragraph. */
function blockKeepingTail(doc: JSONContent, tail: string): JSONContent | null {
  if (BLANK_LINE.test(tail)) return null;
  const target = endTextblock(doc);
  if (!target || !tail.includes("\n")) return target;
  return LINE_HOLDERS.has(target.type ?? "") ? target : null;
}

function paragraphWith(text: string): JSONContent {
  return text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };
}

/**
 * The document the rich box loads from the plain box's text, keeping the
 * spaces and line breaks typed at its end. Markdown drops them when it
 * reads a paragraph, but a person who typed "before it " is about to type
 * the next word: without them it lands joined to the last one. A blank
 * line starts a new paragraph, as it does in the plain box's Markdown; a
 * single line break stays in the paragraph (or code block) it ends; any
 * other end gets a new paragraph holding what follows the last line break.
 */
export function withTypedTail(doc: JSONContent, markdown: string): JSONContent {
  const tail = TRAILING_SPACE.exec(markdown)?.[0] ?? "";
  if (!tail) return doc;
  // A copy: the loaded document stays as Markdown read it.
  const copy = structuredClone(doc);
  const target = blockKeepingTail(copy, tail);
  if (target) {
    target.content = [...(target.content ?? []), { type: "text", text: tail }];
    return copy;
  }
  const afterLastBreak = tail.slice(tail.lastIndexOf("\n") + 1);
  copy.content = [...(copy.content ?? []), paragraphWith(afterLastBreak)];
  return copy;
}

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
