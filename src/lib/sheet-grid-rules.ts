import type { GridCell } from "./csv-edit-rules";

/*
 * Geometry of the spreadsheet grid. Rows and columns have known sizes, so
 * the grid can place any cell, and render only the cells on screen, without
 * measuring the page.
 */

/** Height of one body row, in CSS pixels. */
export const sheetRowHeight = 32;
/** Height of the frozen header row. */
export const sheetHeaderHeight = 36;
/** Width of the frozen row-number column. */
export const rowNumberWidth = 52;
/** The narrowest and widest a column can be. */
export const minColumnWidth = 48;
export const maxColumnWidth = 640;

/** Pixels per character for a default width; text-sm averages close to this. */
const pixelsPerChar = 8;
/** The cell's side padding, both sides together. */
const cellPadding = 24;

/** Keeps a column width between the narrowest and widest a column can be. */
export function clampColumnWidth(width: number): number {
  return Math.round(Math.min(maxColumnWidth, Math.max(minColumnWidth, width)));
}

/** A column's default width in pixels, from a width in characters (columnWidths in csv-view-rules.ts). */
export function pixelWidth(chars: number): number {
  return clampColumnWidth(chars * pixelsPerChar + cellPadding);
}

/**
 * Where each column starts, from the left of the first column: one entry per
 * column plus a last entry for the total width.
 */
export function columnOffsets(widths: readonly number[]): number[] {
  const offsets = [0];
  let total = 0;
  for (const width of widths) {
    total += width;
    offsets.push(total);
  }
  return offsets;
}

/** A run of rows or columns to render: from `start` up to, but not including, `end`. */
export interface Span {
  start: number;
  end: number;
}

/** The first column whose right edge is past `x`, by binary search over the offsets. */
function columnAt(offsets: readonly number[], x: number): number {
  const count = offsets.length - 1;
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((offsets[middle + 1] ?? 0) <= x) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * The columns to render for a horizontal scroll position: those on screen
 * plus `overscan` either side. `scrollLeft` and `viewportWidth` cover the
 * data columns only, not the frozen row numbers.
 */
export function columnSpan(offsets: readonly number[], scrollLeft: number, viewportWidth: number, overscan: number): Span {
  const count = offsets.length - 1;
  if (count <= 0) return { start: 0, end: 0 };
  const left = Math.max(0, scrollLeft);
  const first = columnAt(offsets, left);
  const last = columnAt(offsets, left + Math.max(0, viewportWidth));
  return { start: Math.max(0, first - overscan), end: Math.min(count, last + 1 + overscan) };
}

/**
 * The rows to render for a vertical scroll position: those on screen plus
 * `overscan` either side. `scrollTop` is the scroll box's own. Row r sits at
 * header + r × rowHeight in the content, and the frozen header covers the
 * top `header` pixels of the box, so the first row in view (even partly) is
 * floor(scrollTop / rowHeight), and the header's height comes off the
 * height that rows can fill.
 */
export function rowSpan(scrollTop: number, viewportHeight: number, count: number, overscan: number): Span {
  if (count <= 0) return { start: 0, end: 0 };
  const top = Math.max(0, scrollTop);
  const first = Math.floor(top / sheetRowHeight);
  const visible = Math.ceil(Math.max(0, viewportHeight - sheetHeaderHeight) / sheetRowHeight) + 1;
  return { start: Math.min(count, Math.max(0, first - overscan)), end: Math.min(count, first + visible + overscan) };
}

/**
 * The rows or columns to render: the span in view, plus `keep` (the active
 * row or column) when it is outside it, so the active cell, and a cell
 * editor in it, stay in the page while it scrolls out of view. A `keep`
 * under 0 adds nothing.
 */
export function withKept(span: Span, keep: number): number[] {
  const list: number[] = [];
  if (keep >= 0 && keep < span.start) list.push(keep);
  for (let index = span.start; index < span.end; index += 1) list.push(index);
  if (keep >= span.end) list.push(keep);
  return list;
}

/**
 * The active cell's row and column, which the grid always renders so the
 * cell editor and aria-activedescendant stay valid while it scrolls out of
 * view; -1 for both when there is no active cell to render (no columns, or
 * a filter left fewer rows than the active row).
 */
export function keptCell(active: GridCell, rowCount: number, columnCount: number): GridCell {
  if (columnCount === 0 || active.row >= rowCount || active.column >= columnCount) return { row: -1, column: -1 };
  return active;
}

/** `index` when it is outside the span, else -1: what a row must add to the columns in view. */
export function outsideSpan(span: Span, index: number): number {
  return index >= span.start && index < span.end ? -1 : index;
}

/** The scroll box's position and size. */
export interface ScrollBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

function revealAxis(current: number, start: number, size: number, frozen: number, viewport: number): number {
  const visibleStart = current + frozen;
  const visibleEnd = current + viewport;
  if (start < visibleStart) return start - frozen;
  // A cell wider than the view shows its start.
  if (start + size > visibleEnd) return Math.min(start - frozen, start + size - viewport);
  return current;
}

/**
 * The scroll position that brings a cell fully into view below the frozen
 * header and right of the frozen row numbers, moving as little as it can.
 * The header row (row -1) is always in view vertically.
 */
export function revealCell(box: ScrollBox, cell: GridCell, offsets: readonly number[]): { top: number; left: number } {
  const columnStart = rowNumberWidth + (offsets[cell.column] ?? 0);
  const columnSize = (offsets[cell.column + 1] ?? 0) - (offsets[cell.column] ?? 0);
  const left = revealAxis(box.left, columnStart, columnSize, rowNumberWidth, box.width);
  if (cell.row < 0) return { top: box.top, left: Math.max(0, left) };
  const rowStart = sheetHeaderHeight + cell.row * sheetRowHeight;
  const top = revealAxis(box.top, rowStart, sheetRowHeight, sheetHeaderHeight, box.height);
  return { top: Math.max(0, top), left: Math.max(0, left) };
}

/** Rows that fit under the header, less one so a Page Down keeps one row of context, and at least one. */
export function rowsPerPage(viewportHeight: number): number {
  return Math.max(1, Math.floor((viewportHeight - sheetHeaderHeight) / sheetRowHeight) - 1);
}

/** Space left under the grid when it fills the window. */
const fillGap = 16;
/** The shortest the grid gets, so a page with a tall cover still shows a useful sheet. */
const fillFloor = 240;

/**
 * The tallest the grid gets on an artifact page, as a CSS length: down to
 * the bottom of the window when the page is at its top, but never under
 * 60% of the window below the pinned header, so it fills the screen once
 * the heading scrolls away. `top` is the grid's distance from the top of the
 * document. It uses the small viewport height, so a phone's collapsing
 * address bar does not resize it.
 */
export function sheetFillMaxHeight(top: number): string {
  const fill = `calc(100svh - ${String(Math.round(top + fillGap))}px)`;
  const floor = "calc((100svh - var(--artifact-chrome-height, 0px)) * 0.6)";
  return `max(${fill}, ${floor}, ${String(fillFloor)}px)`;
}
