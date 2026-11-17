import type { Node as DocNode, ResolvedPos } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

/**
 * Where files held over a document will land. A file is a block of its
 * own, so it lands between two blocks, never inside a line of text: above
 * the block under the pointer when the pointer is in its upper half, below
 * it otherwise. A pointer outside the text (over the title, in the margin,
 * under the last line) lands at the nearest block. An empty line is
 * replaced by the file.
 */

/** A point in the window, as a drag event gives it. */
export interface Point {
  x: number;
  y: number;
}

/** The line that shows where files will land, in window coordinates. */
export interface LandingLine {
  left: number;
  top: number;
  width: number;
}

/** Where files land: a document position that makes each one a block there, and the line that shows it. */
export interface Landing {
  pos: number;
  line: LandingLine;
}

/** How far the line sits from a block that has no neighbour on that side. */
const edgeGap = 6;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

function boxOf(view: EditorView, pos: number): DOMRect | null {
  const dom = view.nodeDOM(pos);
  return dom instanceof HTMLElement ? dom.getBoundingClientRect() : null;
}

function isEmptyLine(node: DocNode | null): boolean {
  return node !== null && node.isTextblock && !node.type.spec.code && node.content.size === 0;
}

/** The start of the top-level block the pointer is over, or the end of the document when it is past every block. */
function blockStartAt(view: EditorView, point: Point): number {
  const box = view.dom.getBoundingClientRect();
  const found = view.posAtCoords({ left: clamp(point.x, box.left + 1, box.right - 1), top: clamp(point.y, box.top + 1, box.bottom - 1) });
  const doc = view.state.doc;
  if (!found) return point.y < box.top + box.height / 2 ? 0 : doc.content.size;
  const $pos = doc.resolve(found.pos);
  if ($pos.depth > 0) return $pos.before(1);
  // Between two blocks: over a block that holds no text (a picture, a divider) the position is one of its two sides. When it is the far side, the block before is the one under the pointer: its box holds the pointer's height.
  const before = $pos.nodeBefore;
  const beforeStart = before ? found.pos - before.nodeSize : null;
  const beforeBox = beforeStart === null ? null : boxOf(view, beforeStart);
  return beforeStart !== null && beforeBox && point.y >= beforeBox.top && point.y <= beforeBox.bottom ? beforeStart : found.pos;
}

/** A line across the document's width at a height of the window. */
function lineAcross(view: EditorView, top: number): LandingLine {
  const box = view.dom.getBoundingClientRect();
  return { left: box.left, width: box.width, top };
}

/** The line between the blocks on either side of a top-level position. */
function lineBetween(view: EditorView, pos: number): LandingLine {
  const $pos = view.state.doc.resolve(pos);
  const above = $pos.nodeBefore ? boxOf(view, pos - $pos.nodeBefore.nodeSize) : null;
  const below = $pos.nodeAfter ? boxOf(view, pos) : null;
  if (above && below) return lineAcross(view, (above.bottom + below.top) / 2);
  if (above) return lineAcross(view, above.bottom + edgeGap);
  if (below) return lineAcross(view, below.top - edgeGap);
  return lineAcross(view, view.dom.getBoundingClientRect().top);
}

/** Where files held at `point` will land in this document. */
export function fileLanding(view: EditorView, point: Point): Landing {
  const doc = view.state.doc;
  const start = blockStartAt(view, point);
  const node = start < doc.content.size ? doc.nodeAt(start) : null;
  const box = node ? boxOf(view, start) : null;
  if (!node || !box) return { pos: start, line: lineBetween(view, start) };
  // An empty line takes the file in its place: the position inside it makes the insert replace it.
  if (isEmptyLine(node)) return { pos: start + 1, line: lineAcross(view, box.top + box.height / 2) };
  const pos = point.y < box.top + box.height / 2 ? start : start + node.nodeSize;
  return { pos, line: lineBetween(view, pos) };
}

/** Where a file added from outside the text goes: the end of the document, in place of an empty last line. */
export function endLanding(doc: DocNode): number {
  return isEmptyLine(doc.lastChild) ? doc.content.size - 1 : doc.content.size;
}

/**
 * Where a file goes when it is added at the cursor: after the block the
 * cursor is in (the end of the selection), as a block of its own, or in
 * place of that block when it is an empty line.
 */
export function caretLanding(doc: DocNode, $to: ResolvedPos): number {
  if ($to.depth === 0) return $to.pos;
  const start = $to.before(1);
  return isEmptyLine(doc.nodeAt(start)) ? start + 1 : $to.after(1);
}

/** How long the line stays without a new drag event. Browsers repeat the event several times a second while a file is held. */
const lineLifeMs = 1500;

/**
 * The line itself: one element on the page's body, fixed in the window, so
 * no scroll box or size container between it and the window can clip or
 * move it. It is redrawn on each drag event, which browsers repeat while a
 * file is held, so it follows a page that scrolls under the pointer, and
 * it goes by itself when the events stop: a drag that ends where the page
 * cannot hear it never leaves a line behind.
 */
export class LandingMark {
  private element: HTMLElement | null = null;
  private timer: number | undefined;

  /** Draws the line, or moves it. */
  show(line: LandingLine): void {
    if (!this.element) {
      this.element = document.createElement("div");
      this.element.className = "media-landing-line";
      this.element.setAttribute("aria-hidden", "true");
      this.element.dataset.slot = "media-landing-line";
      document.body.append(this.element);
    }
    this.element.style.top = `${String(line.top)}px`;
    this.element.style.left = `${String(line.left)}px`;
    this.element.style.width = `${String(line.width)}px`;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { this.hide(); }, lineLifeMs);
  }

  /** Takes the line away. */
  hide(): void {
    window.clearTimeout(this.timer);
    this.element?.remove();
    this.element = null;
  }
}
