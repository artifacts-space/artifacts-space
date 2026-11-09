import type { GridCell } from "./csv-edit-rules";

/** A keyboard move in a grid. "next" and "previous" are Tab and Shift+Tab, which wrap across rows. */
export type GridMove = "up" | "down" | "left" | "right" | "rowStart" | "rowEnd" | "gridStart" | "gridEnd" | "pageUp" | "pageDown" | "next" | "previous";

/** The grid's size: data rows (the header is row -1) and columns. */
export interface GridBounds {
  rows: number;
  columns: number;
  /** Rows a Page Up or Page Down moves: a screenful in a grid that knows its height. */
  page?: number;
}

/** Rows a Page Up or Page Down moves when the grid does not say. */
export const pageRows = 10;

const arrowMoves: Partial<Record<string, GridMove>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  PageUp: "pageUp",
  PageDown: "pageDown",
};

/** The move a key press asks for, or null. Ctrl or Cmd with Home or End jumps to the grid's corners. */
export function keyToMove(key: string, modifiers: { shift: boolean; ctrl: boolean }): GridMove | null {
  if (key === "Tab") return modifiers.shift ? "previous" : "next";
  if (key === "Enter") return modifiers.shift ? "up" : "down";
  if (key === "Home") return modifiers.ctrl ? "gridStart" : "rowStart";
  if (key === "End") return modifiers.ctrl ? "gridEnd" : "rowEnd";
  return arrowMoves[key] ?? null;
}

/** A direction Cmd or Ctrl+arrow jumps in. */
export type JumpDirection = "up" | "down" | "left" | "right";

const jumps: Partial<Record<string, JumpDirection>> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

/** What a key press does to the selection: a move or a jump, and whether Shift extends the selection instead of moving it. */
export interface KeyIntent {
  move: GridMove | null;
  jump: JumpDirection | null;
  extend: boolean;
}

/**
 * The selection change a key press asks for, as in a spreadsheet: arrows,
 * Home, End, and Page Up or Down move; with Cmd or Ctrl an arrow jumps to
 * the edge of the data; with Shift each of them extends the selection
 * instead. Tab, Shift+Tab, Enter, and Shift+Enter always move one cell.
 * Returns null for keys that do not move.
 */
export function keyIntent(key: string, modifiers: { shift: boolean; ctrl: boolean }): KeyIntent | null {
  const jump = modifiers.ctrl ? (jumps[key] ?? null) : null;
  const move = jump === null ? keyToMove(key, modifiers) : null;
  if (jump === null && move === null) return null;
  const extend = modifiers.shift && key !== "Tab" && key !== "Enter";
  return { move, jump, extend };
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

function wrapMove(cell: GridCell, step: 1 | -1, bounds: GridBounds): GridCell | null {
  const flat = (cell.row + 1) * bounds.columns + cell.column + step;
  const last = (bounds.rows + 1) * bounds.columns - 1;
  if (flat < 0 || flat > last) return null;
  return { row: Math.floor(flat / bounds.columns) - 1, column: flat % bounds.columns };
}

const pageSize = (bounds: GridBounds) => bounds.page ?? pageRows;

function lineMove(cell: GridCell, move: GridMove, bounds: GridBounds): GridCell {
  const lastRow = bounds.rows - 1;
  const lastColumn = bounds.columns - 1;
  switch (move) {
    case "up": return { row: Math.max(-1, cell.row - 1), column: cell.column };
    case "down": return { row: Math.min(lastRow, cell.row + 1), column: cell.column };
    case "left": return { row: cell.row, column: Math.max(0, cell.column - 1) };
    case "right": return { row: cell.row, column: Math.min(lastColumn, cell.column + 1) };
    case "pageUp": return { row: Math.max(-1, cell.row - pageSize(bounds)), column: cell.column };
    case "pageDown": return { row: Math.min(lastRow, cell.row + pageSize(bounds)), column: cell.column };
    case "rowStart": return { row: cell.row, column: 0 };
    case "rowEnd": return { row: cell.row, column: lastColumn };
    case "gridStart": return { row: -1, column: 0 };
    default: return { row: lastRow, column: lastColumn };
  }
}

/**
 * Where a move lands. Moves stop at the edges; Tab and Shift+Tab wrap to the
 * next or previous row and return null past the first or last cell, so
 * focus can leave the grid.
 */
export function moveCell(cell: GridCell, move: GridMove, bounds: GridBounds): GridCell | null {
  if (bounds.columns === 0) return null;
  if (move === "next" || move === "previous") return wrapMove(cell, move === "next" ? 1 : -1, bounds);
  return lineMove(cell, move, bounds);
}

/** Keeps a cell inside the grid after rows or columns are removed. */
export function clampCell(cell: GridCell, bounds: GridBounds): GridCell {
  return { row: clamp(cell.row, -1, bounds.rows - 1), column: clamp(cell.column, 0, Math.max(0, bounds.columns - 1)) };
}
