import { NodeSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import type { BlockTarget } from "./block-target";

/**
 * Starts dragging a block by its grip. The grip sits outside the document,
 * so this does what ProseMirror does when a drag starts inside it: select
 * the block, put it on the drag's data, and tell the view what is moving.
 * ProseMirror then shows the drop line, moves the block on drop (one
 * transaction, so Undo puts it back), and leaves it in place when the drop
 * lands outside the document.
 */
export function startBlockDrag(view: EditorView, target: BlockTarget, event: DragEvent): void {
  const { dataTransfer } = event;
  if (!dataTransfer) return;
  const selection = NodeSelection.create(view.state.doc, target.pos);
  view.dispatch(view.state.tr.setSelection(selection));
  const slice = selection.content();
  const { dom, text } = view.serializeForClipboard(slice);
  dataTransfer.clearData();
  dataTransfer.setData("text/html", dom.innerHTML);
  dataTransfer.setData("text/plain", text);
  dataTransfer.effectAllowed = "copyMove";
  const element = view.nodeDOM(target.pos);
  if (element instanceof HTMLElement) dataTransfer.setDragImage(element, 0, 0);
  // `node` makes the drop delete exactly this block (prosemirror-view reads it); the view's type leaves it out.
  const dragging = { slice, move: true, node: selection };
  view.dragging = dragging;
}

/** Ends a drag from the grip; the drop, if it landed in the document, has already moved the block. */
export function endBlockDrag(view: EditorView): void {
  view.dragging = null;
}
