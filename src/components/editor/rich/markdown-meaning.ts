import type { JSONContent } from "@tiptap/core";

/*
 * What Markdown can store of a block's text. The editor can hold a space at
 * the end of a line, a line break with nothing after it, and spaces at the
 * start of a line; Markdown stores none of them. Two contents that differ
 * only there are the same content once saved, so a written list is compared
 * with the edit after both are reduced to what Markdown stores.
 */

const textBlocks: ReadonlySet<string> = new Set(["paragraph", "heading"]);

function isBreak(node: JSONContent | undefined): boolean {
  return node?.type === "hardBreak";
}

/** A text node with the spaces Markdown drops removed: at the start of a line, and at the end of one. */
function trimmedText(node: JSONContent, startsLine: boolean, endsLine: boolean): JSONContent {
  let text = node.text ?? "";
  if (startsLine) text = text.replace(/^[ \t]+/, "");
  if (endsLine) text = text.replace(/[ \t]+$/, "");
  return text === node.text ? node : { ...node, text };
}

/** A text block's inline content as Markdown stores it. */
function storedInline(content: readonly JSONContent[]): JSONContent[] {
  let inline = [...content];
  let before = -1;
  // Dropping an empty text node can put a new node at the start or the end of a line, so repeat until nothing changes.
  while (inline.length !== before) {
    before = inline.length;
    inline = inline
      .map((node, index) => (node.type === "text" ? trimmedText(node, index === 0 || isBreak(inline[index - 1]), index === inline.length - 1 || isBreak(inline[index + 1])) : node))
      .filter((node) => node.type !== "text" || node.text !== "");
    while (isBreak(inline.at(-1))) inline.pop();
  }
  return inline;
}

function storedNode(node: JSONContent): JSONContent {
  if (!node.content) return node;
  if (!textBlocks.has(node.type ?? "")) return { ...node, content: node.content.map((child) => storedNode(child)) };
  const inline = storedInline(node.content);
  if (inline.length > 0) return { ...node, content: inline };
  const empty = { ...node };
  delete empty.content;
  return empty;
}

/**
 * The nodes as Markdown can store them: every paragraph and heading without
 * the spaces at the start and end of its lines and without a line break at
 * its end. Code blocks keep every character.
 */
export function asStored(nodes: readonly JSONContent[]): JSONContent[] {
  return nodes.map((node) => storedNode(node));
}
