"use client";

import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useRef, useState } from "react";

import { dropTarget, resizedWidth } from "@/lib/sheet-column-rules";
import { rowNumberWidth } from "@/lib/sheet-grid-rules";

/** Pixels a pointer travels before a press on a header becomes a drag. */
const dragThreshold = 5;
/** How close to the grid's side the pointer comes before the grid scrolls that way, and how far each move scrolls it. */
const edgeZone = 32;
const edgeStep = 16;

/** A header being dragged to a new place. */
export interface ColumnDrag {
  from: number;
  to: number;
}

/** A column edge being dragged to a new width. */
export interface ColumnResize {
  column: number;
  width: number;
}

interface Handlers {
  onColumnMove?: ((from: number, to: number) => void) | undefined;
  onColumnResize?: ((column: number, width: number) => void) | undefined;
}

/**
 * Runs `move` on every pointer move and `end` once on release or cancel.
 * Returns a teardown that removes the listeners without calling `end`, for
 * a grid that goes away mid-drag.
 */
function track(event: ReactPointerEvent, move: (event: PointerEvent) => void, end: (event: PointerEvent, cancelled: boolean) => void): () => void {
  const pointer = event.pointerId;
  const onMove = (next: PointerEvent) => { if (next.pointerId === pointer) move(next); };
  const stop = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", finish);
  };
  function finish(next: PointerEvent) {
    if (next.pointerId !== pointer) return;
    stop();
    end(next, next.type === "pointercancel");
  }
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);
  return stop;
}

/** Only a mouse or a pen drags columns; on touch screens a drag scrolls the grid. */
const canDrag = (event: ReactPointerEvent) => event.button === 0 && event.pointerType !== "touch";

function scrollAtEdge(scroller: HTMLElement, clientX: number) {
  const box = scroller.getBoundingClientRect();
  if (clientX < box.left + rowNumberWidth + edgeZone) scroller.scrollLeft -= edgeStep;
  else if (clientX > box.right - edgeZone) scroller.scrollLeft += edgeStep;
}

/**
 * Moving and resizing columns with a mouse: drag a header to move its
 * column, drag a header's right edge to resize it. While dragging, the grid
 * shows the drop place or the new width; the change is handed on only on
 * release. A click that ends a drag is swallowed, so it does not also sort.
 */
export function useColumnDrag(scrollerRef: RefObject<HTMLElement | null>, offsets: readonly number[], handlers: Handlers) {
  const [drag, setDrag] = useState<ColumnDrag | null>(null);
  const [resize, setResize] = useState<ColumnResize | null>(null);
  const swallowClick = useRef(false);
  // The drag in progress, so its window listeners go when the grid does.
  const stopTracking = useRef<(() => void) | null>(null);
  useEffect(() => () => { stopTracking.current?.(); }, []);

  /**
   * Swallows the click that ends this drag. A drag released over the body
   * sends its click to the grid, not the header, so the next click of any
   * kind clears the latch instead: it never outlives its gesture.
   */
  function armSwallow() {
    swallowClick.current = true;
    window.addEventListener("click", () => { swallowClick.current = false; }, { once: true });
  }

  const contentX = (clientX: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return 0;
    return clientX - scroller.getBoundingClientRect().left + scroller.scrollLeft - rowNumberWidth;
  };

  function startMove(column: number, event: ReactPointerEvent) {
    const onColumnMove = handlers.onColumnMove;
    if (!onColumnMove || !canDrag(event)) return;
    // A latch left by an earlier drag that never ended in a header click must not eat this gesture's click.
    swallowClick.current = false;
    const startX = event.clientX;
    let current: ColumnDrag | null = null;
    stopTracking.current = track(event, (move) => {
      if (current === null && Math.abs(move.clientX - startX) < dragThreshold) return;
      const scroller = scrollerRef.current;
      if (scroller) scrollAtEdge(scroller, move.clientX);
      current = { from: column, to: dropTarget(offsets, column, contentX(move.clientX)) };
      setDrag(current);
    }, (_end, cancelled) => {
      setDrag(null);
      stopTracking.current = null;
      if (current === null || cancelled) return;
      armSwallow();
      if (current.to !== current.from) onColumnMove(current.from, current.to);
    });
  }

  function startResize(column: number, event: ReactPointerEvent) {
    const onColumnResize = handlers.onColumnResize;
    if (!onColumnResize || !canDrag(event)) return;
    swallowClick.current = false;
    event.stopPropagation();
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = (offsets[column + 1] ?? 0) - (offsets[column] ?? 0);
    let width = startWidth;
    stopTracking.current = track(event, (move) => {
      width = resizedWidth(startWidth, startX, move.clientX);
      setResize({ column, width });
    }, (_end, cancelled) => {
      setResize(null);
      stopTracking.current = null;
      if (!cancelled && width !== startWidth) onColumnResize(column, width);
    });
  }

  /** For the header row's click capture: true once after a drag, so that click is dropped. */
  function takeSwallowedClick() {
    const swallow = swallowClick.current;
    swallowClick.current = false;
    return swallow;
  }

  return { drag, resize, startMove, startResize, takeSwallowedClick };
}
