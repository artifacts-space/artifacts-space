"use client";

import { type RefObject, useEffect, useState } from "react";

import { rowWindow, type RowWindow } from "@/lib/grid-navigation";

/** Tables with more rows than this render only the rows near the screen. */
export const virtualizeAbove = 150;
/** Rows rendered before the browser has measured a row, including on the server. */
const firstPaintRows = 60;
const overscan = 10;

export interface VirtualRows extends RowWindow {
  /** Measured height of one body row in pixels, or 0 before measuring. */
  rowHeight: number;
  /** Space standing in for the rows above and below the window. */
  padTop: number;
  padBottom: number;
}

interface Measure {
  window: RowWindow;
  rowHeight: number;
}

function sameMeasure(a: Measure, b: Measure): boolean {
  return a.rowHeight === b.rowHeight && a.window.start === b.window.start && a.window.end === b.window.end;
}

function readMeasure(scroller: HTMLElement, count: number, known: number): Measure {
  const row = scroller.querySelector<HTMLElement>("tbody tr[data-row]");
  const rowHeight = known > 0 ? known : (row?.getBoundingClientRect().height ?? 0);
  const headerHeight = scroller.querySelector("thead")?.getBoundingClientRect().height ?? 0;
  return { rowHeight, window: rowWindow(scroller.scrollTop - headerHeight, scroller.clientHeight, rowHeight, count, overscan) };
}

/**
 * Row virtualization for a table inside a scrolling frame. Above
 * `virtualizeAbove` rows it renders only the rows near the screen and pads
 * the rest, so a 1,000-row CSV stays quick. Rows must share one height. It
 * listens for scroll and resize events; it never polls.
 */
export function useVirtualRows(scrollerRef: RefObject<HTMLElement | null>, count: number): VirtualRows {
  const enabled = count > virtualizeAbove;
  const [measure, setMeasure] = useState<Measure>({ rowHeight: 0, window: { start: 0, end: Math.min(count, firstPaintRows) } });

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!enabled || !scroller) return;
    let rowHeight = 0;
    const update = () => {
      const next = readMeasure(scroller, count, rowHeight);
      rowHeight = next.rowHeight;
      setMeasure((current) => (sameMeasure(current, next) ? current : next));
    };
    const remeasure = () => {
      rowHeight = 0;
      update();
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(remeasure);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [scrollerRef, count, enabled]);

  if (!enabled) return { start: 0, end: count, rowHeight: 0, padTop: 0, padBottom: 0 };
  const start = Math.min(measure.window.start, count);
  const end = measure.rowHeight > 0 ? Math.min(measure.window.end, count) : Math.min(count, firstPaintRows);
  return { start, end, rowHeight: measure.rowHeight, padTop: start * measure.rowHeight, padBottom: Math.max(0, count - end) * measure.rowHeight };
}
