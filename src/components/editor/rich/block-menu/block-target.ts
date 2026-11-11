import { Fragment, type Node as PMNode, type ResolvedPos } from "@tiptap/pm/model";
import { Selection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

/*
 * The block a handle or menu acts on, and the edits it makes. A block is a
 * top-level node (paragraph, heading, list, quote, code, table, media), or a
 * list item at any depth: list items move, copy, and delete as items. Every
 * edit is one ordinary transaction, so Undo takes it back and autosave saves
 * it like typing.
 */

/** List item node names: these act as blocks of their own. */
const itemNames: ReadonlySet<string> = new Set(["listItem", "taskItem"]);

/** List node names: a list item's parent. */
const listNames: ReadonlySet<string> = new Set(["bulletList", "orderedList", "taskList"]);

/** True for a list item node. */
export function isListItem(node: PMNode): boolean {
  return itemNames.has(node.type.name);
}

/** True for a list node. */
export function isList(node: PMNode): boolean {
  return listNames.has(node.type.name);
}

/** One block: where it starts, the node, and whether it is a list item. */
export interface BlockTarget {
  /** The position just before the node. */
  pos: number;
  node: PMNode;
  item: boolean;
}

/** The innermost list item around `$pos`, if any. */
function itemAround($pos: ResolvedPos): BlockTarget | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (isListItem(node)) return { pos: $pos.before(depth), node, item: true };
  }
  return null;
}

/** The top-level block at a position between top-level blocks: the one after it, else the one before. */
function topLevelAtGap($pos: ResolvedPos): BlockTarget | null {
  const after = $pos.nodeAfter;
  if (after) return { pos: $pos.pos, node: after, item: false };
  const before = $pos.nodeBefore;
  return before ? { pos: $pos.pos - before.nodeSize, node: before, item: false } : null;
}

/** The block at a document position: the innermost list item around it, else its top-level block. */
export function blockTargetAt(doc: PMNode, pos: number): BlockTarget | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  if ($pos.depth === 0) return topLevelAtGap($pos);
  const item = itemAround($pos);
  if (item) return item;
  return { pos: $pos.before(1), node: $pos.node(1), item: false };
}

/** The block that starts at `pos`, read again from the document; null when it is gone. */
export function blockTargetFrom(doc: PMNode, pos: number): BlockTarget | null {
  if (pos < 0 || pos >= doc.content.size) return null;
  const node = doc.nodeAt(pos);
  if (!node) return null;
  const parent = doc.resolve(pos).parent;
  const item = isListItem(node);
  if (!item && parent !== doc) return null;
  return { pos, node, item };
}

/** Every block in document order: top-level blocks that are not lists, and every list item. */
export function documentBlocks(doc: PMNode): BlockTarget[] {
  const blocks: BlockTarget[] = [];
  doc.descendants((node, pos, parent) => {
    if (isListItem(node)) blocks.push({ pos, node, item: true });
    else if (parent === doc && !isList(node)) blocks.push({ pos, node, item: false });
    return !node.isTextblock;
  });
  return blocks;
}

/** A block's text with block boundaries as spaces, as a reader sees it. */
export function blockText(node: PMNode): string {
  return node.textBetween(0, node.content.size, " ", " ");
}

/** Words and characters in a block, for the menu's footer. */
export function blockCounts(node: PMNode): { words: number; characters: number } {
  const text = blockText(node).trim();
  return { words: text ? text.split(/\s+/).length : 0, characters: node.textContent.length };
}

/** The block's index among its siblings, and the parent holding them. */
function siblings(doc: PMNode, target: BlockTarget) {
  const $pos = doc.resolve(target.pos);
  return { parent: $pos.parent, index: $pos.index() };
}

/** Whether the block has a sibling to swap with, above (-1) or below (1). */
export function canMoveBlock(doc: PMNode, target: BlockTarget, direction: -1 | 1): boolean {
  const { parent, index } = siblings(doc, target);
  const next = index + direction;
  return next >= 0 && next < parent.childCount;
}

/**
 * Puts the cursor back where it was inside a block that moved from `from` to
 * `to`, or at the start of the block when it was elsewhere.
 */
function keepCursorIn(tr: Transaction, state: EditorState, target: BlockTarget, to: number): Transaction {
  const offset = state.selection.from - target.pos;
  const inside = offset > 0 && offset < target.node.nodeSize;
  const at = Math.min(to + (inside ? offset : 1), tr.doc.content.size);
  return tr.setSelection(Selection.near(tr.doc.resolve(at)));
}

/** Swaps the block with the sibling above (-1) or below (1). Null when there is none. */
export function moveBlock(state: EditorState, target: BlockTarget, direction: -1 | 1): Transaction | null {
  const { doc } = state;
  if (!canMoveBlock(doc, target, direction)) return null;
  const { parent, index } = siblings(doc, target);
  const other = parent.child(index + direction);
  const end = target.pos + target.node.nodeSize;
  const tr = state.tr;
  if (direction === -1) {
    const from = target.pos - other.nodeSize;
    tr.replaceWith(from, end, Fragment.from([target.node, other]));
    return keepCursorIn(tr, state, target, from).scrollIntoView();
  }
  tr.replaceWith(target.pos, end + other.nodeSize, Fragment.from([other, target.node]));
  return keepCursorIn(tr, state, target, target.pos + other.nodeSize).scrollIntoView();
}

/** Inserts a copy of the block right after it and puts the cursor in the copy. */
export function duplicateBlock(state: EditorState, target: BlockTarget): Transaction {
  const end = target.pos + target.node.nodeSize;
  const tr = state.tr.insert(end, target.node);
  return keepCursorIn(tr, state, target, end).scrollIntoView();
}

/** The range a delete removes: the block, or its whole list when it is the list's only item. */
function deletedRange(doc: PMNode, target: BlockTarget): { from: number; to: number; only: boolean } {
  let from = target.pos;
  let to = target.pos + target.node.nodeSize;
  let $from = doc.resolve(from);
  while ($from.depth > 0 && $from.parent.childCount === 1 && isList($from.parent)) {
    from = $from.before();
    to = $from.after();
    $from = doc.resolve(from);
  }
  return { from, to, only: $from.depth === 0 && doc.childCount === 1 };
}

/**
 * Deletes the block (a list that would be left empty goes with it). The last
 * block in the document becomes an empty paragraph instead, so the document
 * always has a line to type on.
 */
export function deleteBlock(state: EditorState, target: BlockTarget): Transaction {
  const { from, to, only } = deletedRange(state.doc, target);
  const tr = state.tr;
  if (only) {
    const paragraph = state.schema.nodes.paragraph;
    if (paragraph) tr.replaceWith(from, to, paragraph.create());
  } else {
    tr.delete(from, to);
  }
  const at = Math.min(from, tr.doc.content.size);
  return tr.setSelection(Selection.near(tr.doc.resolve(at))).scrollIntoView();
}

/** The text range covering a whole block, for changing every line in it at once. */
export function blockTextRange(target: BlockTarget): { from: number; to: number } {
  return { from: target.pos + 1, to: target.pos + target.node.nodeSize - 1 };
}

/** A text selection inside a list item's own first line, so changing it leaves the rest of the list alone. */
export function itemLineSelection(doc: PMNode, target: BlockTarget): TextSelection {
  const first = target.node.firstChild;
  const start = target.pos + 2;
  const end = start + (first?.content.size ?? 0);
  return TextSelection.create(doc, start, Math.max(start, end));
}

/** What a block is, for Change and the menu's heading: a list item reports its first line and its list. */
export function blockShape(doc: PMNode, target: BlockTarget): { node: string; level: number | undefined; list: string | undefined } {
  if (target.item) return { node: target.node.firstChild?.type.name ?? "paragraph", level: undefined, list: doc.resolve(target.pos).parent.type.name };
  const level: unknown = target.node.attrs.level;
  return { node: target.node.type.name, level: typeof level === "number" ? level : undefined, list: undefined };
}
