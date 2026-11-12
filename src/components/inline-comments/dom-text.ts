import type { TextSpan } from "@/lib/comments/anchor-rules";

/*
 * The text of a rendered artifact as one string, and the way back from a
 * place in that string to the page: inline comments find their words in the
 * string (src/lib/comments/anchor-rules.ts) and highlight the matching
 * stretch of the page. It reads the page and never changes it, so the same
 * code serves the editor and the read view.
 */

/** Text inside these is not part of the document's words: drawings, and anything marked to skip. */
const SKIPPED = "svg, [data-comment-skip]";

/** The text under one element, with each text node's place in it. */
export interface TextIndex {
  text: string;
  nodes: Text[];
  /** `starts[i]` is where `nodes[i]` begins in `text`. */
  starts: number[];
}

/** Every text node under `root` that holds document words, in reading order. */
export function indexText(root: Node): TextIndex {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest(SKIPPED) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes: Text[] = [];
  const starts: number[] = [];
  const parts: string[] = [];
  let length = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node instanceof Text) || node.data.length === 0) continue;
    nodes.push(node);
    starts.push(length);
    parts.push(node.data);
    length += node.data.length;
  }
  return { text: parts.join(""), nodes, starts };
}

/** The text node that holds the character at `offset`, and the place inside it. `end` picks the node that ends there over the one that starts there. */
function nodeAt(index: TextIndex, offset: number, end: boolean): { node: Text; offset: number } | null {
  let low = 0;
  let high = index.nodes.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const node = index.nodes[middle];
    const start = index.starts[middle];
    if (!node || start === undefined) return null;
    const last = start + node.data.length;
    const inside = end ? offset > start && offset <= last : offset >= start && offset < last;
    if (inside) return { node, offset: offset - start };
    if (offset < last) high = middle - 1;
    else low = middle + 1;
  }
  return null;
}

/** The stretch of the page that a span of the indexed text covers, or null when the span is empty or outside it. */
export function rangeOf(index: TextIndex, span: TextSpan): Range | null {
  if (span.end <= span.start) return null;
  const from = nodeAt(index, span.start, false);
  const to = nodeAt(index, span.end, true);
  if (!from || !to) return null;
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  return range;
}

/**
 * The span of the indexed text that a stretch of the page (a selection)
 * covers: from the first indexed text it touches to the last. Null when it
 * touches none.
 */
export function spanOf(index: TextIndex, range: Range): TextSpan | null {
  let start: number | null = null;
  let end: number | null = null;
  for (const [position, node] of index.nodes.entries()) {
    if (!range.intersectsNode(node)) continue;
    const base = index.starts[position] ?? 0;
    start ??= base + (node === range.startContainer ? range.startOffset : 0);
    end = base + (node === range.endContainer ? range.endOffset : node.data.length);
  }
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

/** True when a point on screen is on the text a range covers (not just near it). */
export function rangeHasPoint(range: Range, x: number, y: number): boolean {
  for (const box of range.getClientRects()) {
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return true;
  }
  return false;
}
