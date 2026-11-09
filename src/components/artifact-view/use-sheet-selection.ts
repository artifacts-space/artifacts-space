"use client";

import { type ClipboardEvent, useCallback, useState } from "react";

import type { GridCell } from "@/lib/csv-edit-rules";
import type { GridBounds } from "@/lib/grid-navigation";
import { clampSelection, type GridSelection, isSingleCell, rangeSize, rangeToTsv, selectionRange, singleCell } from "@/lib/grid-selection-rules";

/** The selection in a sheet, kept inside it as rows and columns come and go. */
export function useSheetSelection(bounds: GridBounds) {
  const [raw, setRaw] = useState<GridSelection>(() => singleCell({ row: 0, column: 0 }));
  const selection = clampSelection(raw, bounds);
  /** Selects one cell, or changes the active cell with an updater. */
  const setActive = useCallback((next: GridCell | ((current: GridCell) => GridCell)) => {
    setRaw((current) => singleCell(typeof next === "function" ? next(current.active) : next));
  }, []);
  return { selection, active: selection.active, setSelection: setRaw, setActive };
}

/** Copies the selected block to the clipboard as TSV, as Sheets does, with the header row when it is selected. */
export function copySelection(event: ClipboardEvent, selection: GridSelection, valueAt: (cell: GridCell) => string) {
  event.clipboardData.setData("text/plain", rangeToTsv(selectionRange(selection), valueAt));
  event.preventDefault();
}

/** What the formula bar's name box says: the column and row of one cell, or the size of a block. */
export function selectionLabel(selection: GridSelection, columnName: (column: number) => string, rowLabel: (row: number) => string): string {
  if (!isSingleCell(selection)) {
    const { rows, columns } = rangeSize(selectionRange(selection));
    return `${String(rows)} × ${String(columns)}`;
  }
  const { row, column } = selection.active;
  const name = columnName(column) || `Column ${String(column + 1)}`;
  return row === -1 ? `${name} · name` : `${name} · ${rowLabel(row)}`;
}
