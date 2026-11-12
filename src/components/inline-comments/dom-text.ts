import type { TextSpan } from "@/lib/comments/anchor-rules";

/*
 * The text of a rendered artifact as one string, and the way back from a
 * place in that string to the page: inline comments find their words in the
 * string (src/lib/comments/anchor-rules.ts) and highlight the matching
 * stretch of the page. It reads the page and never changes it, so the same
 * code serves the editor and the read view.
 */

/**
 * Text inside these is not part of the document's words: drawings, controls,
 * text only a screen reader gets (a link's "opens in a new tab"), and
 * anything marked to skip. The editor and the read view must read the same
 * words, so each one's own interface text is left out.
 */
const SKIPPED = "svg, button, select, textarea, .sr-only, [data-comment-skip]";

/** Elements that start a new line of text: words on both sides of one are not one run of words. */
const LINE_STARTS = new Set(["ADDRESS", "BLOCKQUOTE", "BR", "DD", "DIV", "DT", "FIGCAPTION", "FIGURE", "H1", "H2", "H3", "H4", "H5", "H6", "HR", "LI", "P", "PRE", "TD", "TH", "TR"]);

/** An editor's own interface inside the text (a block's controls): not editable, with nothing editable inside. */
function isEditorChrome(element: Element): boolean {
  return element.getAttribute("contenteditable") === "false" && element.querySelector("[contenteditable=true]") === null;
}

function isSkipped(element: Element): boolean {
  return element.matches(SKIPPED) || isEditorChrome(element);
}

/** The text under one element, with each text node's place in it. */
export interface TextIndex {
  text: string;
  nodes: Text[];
  /** `starts[i]` is where `nodes[i]` begins in `text`. */
  starts: number[];
}

/**
 * Every text node under `root` that holds document words, in reading order.
 * Between two blocks (and at a line break) the text gets a line break that
 * belongs to no node, so the last word of one paragraph and the first of the
 * next stay two words.
 */
export function indexText(root: Node): TextIndex {
  // A skipped element is rejected whole, so nothing inside it is visited.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => (node instanceof Element && isSkipped(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes: Text[] = [];
  const starts: number[] = [];
  const parts: string[] = [];
  let length = 0;
  let newLine = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Element) {
      newLine ||= LINE_STARTS.has(node.tagName);
      continue;
    }
    if (!(node instanceof Text) || node.data.length === 0) continue;
    if (newLine && length > 0) {
      parts.push("\n");
      length += 1;
    }
    newLine = false;
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
  const around = range.getBoundingClientRect();
  if (x < around.left || x > around.right || y < around.top || y > around.bottom) return false;
  for (const box of range.getClientRects()) {
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return true;
  }
  return false;
}
