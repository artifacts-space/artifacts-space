import type { Editor } from "@tiptap/core";
import { TextSelection, type Transaction } from "@tiptap/pm/state";
import { toast } from "sonner";

import { copyBlockLink } from "@/components/block-links/copy-block-link";
import { quotedCommentBody, requestQuotedComment } from "@/components/comments/quote-request";
import { blockLink } from "@/lib/block-links/anchor-rules";

import type { BlockActionId } from "./block-actions";
import { anchorForBlockAt } from "./block-links";
import type { BlockMenuPage } from "./block-menu-context";
import { blockTypes, currentBlockType } from "./block-types";
import { blockShape, blockTargetFrom, blockText, blockTextRange, deleteBlock, duplicateBlock, itemLineSelection, moveBlock, type BlockTarget } from "./block-target";

/*
 * What the block menu and its shortcuts do to a block. Duplicate, Move, and
 * Delete are one transaction each and Change is one chain, so each is one
 * step of Undo and autosave saves it like typing.
 */

/** Sends a transaction as the person's own edit and puts the cursor back in the document. */
function apply(editor: Editor, tr: Transaction | null): boolean {
  if (!tr) return false;
  editor.view.dispatch(tr);
  editor.view.focus();
  return true;
}

/** The link to a block on its artifact page, or null when it cannot be named. */
export function linkToBlock(editor: Editor, target: BlockTarget, publicId: string): string | null {
  const anchor = anchorForBlockAt(editor.state.doc, target.pos);
  return anchor ? blockLink(window.location.origin, publicId, anchor) : null;
}

/** Copies the block's link and says so. */
function copyLink(editor: Editor, target: BlockTarget, publicId: string): boolean {
  const link = linkToBlock(editor, target, publicId);
  if (!link) return false;
  copyBlockLink(link);
  return true;
}

/** Opens the artifact's comments with a new comment quoting the block. */
function comment(editor: Editor, target: BlockTarget, publicId: string): boolean {
  const link = linkToBlock(editor, target, publicId) ?? `${window.location.origin}/artifact/${encodeURIComponent(publicId)}`;
  requestQuotedComment(publicId, quotedCommentBody(blockText(target.node), link));
  return true;
}

/** Deletes the block, with Undo in the notice. */
function remove(editor: Editor, target: BlockTarget): boolean {
  apply(editor, deleteBlock(editor.state, target));
  toast("Block deleted", { action: { label: "Undo", onClick: () => { editor.chain().focus().undo().run(); } } });
  return true;
}

/** Runs one menu action on the block that starts at `pos`. False when it did nothing. */
export function runBlockAction(editor: Editor, pos: number, id: BlockActionId, page: BlockMenuPage | null): boolean {
  const target = blockTargetFrom(editor.state.doc, pos);
  if (!target) return false;
  if (id === "duplicate") return apply(editor, duplicateBlock(editor.state, target));
  if (id === "moveUp") return apply(editor, moveBlock(editor.state, target, -1));
  if (id === "moveDown") return apply(editor, moveBlock(editor.state, target, 1));
  if (id === "delete") return remove(editor, target);
  const publicId = page?.publicId;
  if (!publicId) return false;
  if (id === "copyLink") return copyLink(editor, target, publicId);
  return page.canComment ? comment(editor, target, publicId) : false;
}

/**
 * Changes a block to another type. A list item changing to another list
 * changes its list; a list item changing to anything else leaves the list as
 * that type, and every other block changes all of its lines.
 */
export function changeBlockType(editor: Editor, pos: number, typeId: string): boolean {
  const target = blockTargetFrom(editor.state.doc, pos);
  const option = blockTypes.find((entry) => entry.id === typeId);
  if (!target || !option) return false;
  if (currentBlockType(blockShape(editor.state.doc, target))?.id === option.id) return false;
  const chain = editor.chain().focus();
  if (target.item) {
    const line = itemLineSelection(editor.state.doc, target);
    const selected = chain.setTextSelection({ from: line.from, to: line.to });
    return (option.list ? option.apply(selected) : option.apply(selected.clearNodes())).run();
  }
  return option.apply(chain.setTextSelection(blockTextRange(target)).clearNodes()).run();
}

/**
 * "+" beside a block: a new line under it. Under a top-level block the line
 * starts with "/" so the block menu of the slash command opens; under a list
 * item it is a new, empty item.
 */
export function insertBelow(editor: Editor, pos: number): boolean {
  const target = blockTargetFrom(editor.state.doc, pos);
  const paragraph = editor.schema.nodes.paragraph;
  if (!target || !paragraph) return false;
  const end = target.pos + target.node.nodeSize;
  const line = target.item ? target.node.type.createAndFill() : paragraph.create(null, editor.schema.text("/"));
  if (!line) return false;
  const tr = editor.state.tr.insert(end, line);
  // Inside the new line's paragraph, after the "/" when there is one: two steps in either way.
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(end + 2, tr.doc.content.size))));
  return apply(editor, tr.scrollIntoView());
}
