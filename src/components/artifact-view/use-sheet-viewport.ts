"use client";

import { type RefObject, useEffect, useState } from "react";

import { columnSpan, rowNumberWidth, rowSpan, type Span } from "@/lib/sheet-grid-rules";

/** Rows and columns rendered beyond the edges of the view, so a quick scroll does not show blank cells. */
const rowOverscan = 8;
const columnOverscan = 2;
/** What renders before the browser has measured the view, including on the server. */
const firstPaint = { rows: 40, width: 1600 };

/** The rows and columns to render: those in view plus a margin. */
export interface SheetWindow {
  rows: Span;
  columns: Span;
}

const sameSpan = (a: Span, b: Span) => a.start === b.start && a.end === b.end;
const sameWindow = (a: SheetWindow, b: SheetWindow) => sameSpan(a.rows, b.rows) && sameSpan(a.columns, b.columns);

function windowFor(box: { top: number; left: number; width: number; height: number }, rowCount: number, offsets: readonly number[]): SheetWindow {
  return {
    rows: rowSpan(box.top, box.height, rowCount, rowOverscan),
    columns: columnSpan(offsets, box.left, box.width - rowNumberWidth, columnOverscan),
  };
}

/**
 * Row and column virtualization for the sheet grid: only the cells in view
 * (plus a margin) are in the DOM, so a sheet at the size limit scrolls
 * smoothly. Every row and column has a known size (sheet-grid-rules.ts),
 * so nothing is measured but the scroll box. It listens for scroll and
 * resize events and re-renders only when the window of cells changes; it
 * never polls.
 */
export function useSheetViewport(scrollerRef: RefObject<HTMLElement | null>, rowCount: number, offsets: readonly number[]): SheetWindow {
  const [measured, setMeasured] = useState<SheetWindow | null>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const update = () => {
      const next = windowFor({ top: scroller.scrollTop, left: scroller.scrollLeft, width: scroller.clientWidth, height: scroller.clientHeight }, rowCount, offsets);
      setMeasured((current) => (current && sameWindow(current, next) ? current : next));
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [scrollerRef, rowCount, offsets]);

  // Clamped, because a filter or a deleted column can shrink the sheet before the next measure.
  const columnCount = offsets.length - 1;
  if (measured) {
    return {
      rows: { start: Math.min(measured.rows.start, rowCount), end: Math.min(measured.rows.end, rowCount) },
      columns: { start: Math.min(measured.columns.start, columnCount), end: Math.min(measured.columns.end, columnCount) },
    };
  }
  return {
    rows: { start: 0, end: Math.min(rowCount, firstPaint.rows) },
    columns: columnSpan(offsets, 0, firstPaint.width, 0),
  };
}
