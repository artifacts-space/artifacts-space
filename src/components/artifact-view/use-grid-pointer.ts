"use client";

import { type MouseEvent, type PointerEvent, useRef } from "react";

import type { GridCell } from "@/lib/csv-edit-rules";
import { extendTo, type GridSelection, isSingleCell, singleCell } from "@/lib/grid-selection-rules";

/** The cell an element belongs to, from its `data-cell` attribute, or null. */
export function cellOf(target: EventTarget | Element | null): GridCell | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest<HTMLElement>("[data-cell]");
  if (!element) return null;
  const [row, column] = (element.dataset.cell ?? "").split(":").map(Number);
  if (row === undefined || column === undefined || Number.isNaN(row) || Number.isNaN(column)) return null;
  return { row, column };
}

const sameCell = (a: GridCell, b: GridCell) => a.row === b.row && a.column === b.column;

/**
 * The body cell a mouse or pen press starts a selection on, or null: touch
 * selects on tap instead, presses inside a cell editor or a button are
 * theirs, and header presses belong to sorting and column dragging (their
 * click selects the header cell).
 */
function pressedCell(event: PointerEvent): GridCell | null {
  if (event.pointerType === "touch" || event.button !== 0) return null;
  if (event.target instanceof Element && event.target.closest("textarea, input, button")) return null;
  const cell = cellOf(event.target);
  return cell === null || cell.row < 0 ? null : cell;
}

interface PointerInput {
  selection: GridSelection;
  onSelectionChange: (selection: GridSelection) => void;
  /** A click on the cell that is already the only one selected, such as to start editing. */
  onActiveClick?: ((cell: GridCell) => void) | undefined;
}

/**
 * Selecting with a mouse, as in a spreadsheet: press a cell to select it,
 * Shift+click to extend the selection, and drag across cells to select a
 * block. A click on the cell that is already selected, in a grid that
 * already had focus, is handed on (to start editing). Touch screens select
 * on tap, so a drag still scrolls.
 */
export function useGridPointer({ selection, onSelectionChange, onActiveClick }: PointerInput) {
  // Set on a mouse press, so the click that follows only decides about editing.
  const pressed = useRef<{ cell: GridCell; wasActive: boolean } | null>(null);
  // Whether the grid had focus when the press began: the first click into a grid only selects, never edits.
  const hadFocus = useRef(false);

  function dragSelect(event: PointerEvent, anchor: GridSelection) {
    const pointer = event.pointerId;
    let current = anchor;
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointer) return;
      const cell = cellOf(document.elementFromPoint(next.clientX, next.clientY));
      if (cell === null || cell.row < 0 || sameCell(cell, current.active)) return;
      current = extendTo(current, cell);
      onSelectionChange(current);
    };
    const end = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointer) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  function onPointerDown(event: PointerEvent) {
    pressed.current = null;
    hadFocus.current = event.currentTarget.contains(document.activeElement);
    const cell = pressedCell(event);
    if (cell === null) return;
    const wasActive = hadFocus.current && isSingleCell(selection) && sameCell(selection.active, cell);
    pressed.current = { cell, wasActive };
    const next = event.shiftKey ? extendTo(selection, cell) : singleCell(cell);
    if (!wasActive) onSelectionChange(next);
    if (!event.shiftKey) dragSelect(event, next);
  }

  /** A tap or a keyboard click, which no mouse press came before: select now. */
  function clickWithoutPress(cell: GridCell, shift: boolean) {
    if (shift) onSelectionChange(extendTo(selection, cell));
    else if (hadFocus.current && isSingleCell(selection) && sameCell(selection.active, cell)) onActiveClick?.(cell);
    else onSelectionChange(singleCell(cell));
  }

  function onClick(event: MouseEvent) {
    const cell = cellOf(event.target);
    const press = pressed.current;
    pressed.current = null;
    if (cell === null) return;
    if (press === null) {
      clickWithoutPress(cell, event.shiftKey);
      return;
    }
    if (press.wasActive && sameCell(press.cell, cell) && !event.shiftKey) onActiveClick?.(cell);
  }

  return { onPointerDown, onClick };
}
