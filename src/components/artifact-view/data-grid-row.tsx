"use client";

import { memo, type ReactNode } from "react";

import type { GridCell } from "@/lib/csv-edit-rules";
import type { SheetAlignment } from "@/lib/sheet-format/rules";
import { withKept, rowNumberWidth, sheetHeaderHeight, sheetRowHeight, type Span } from "@/lib/sheet-grid-rules";

/** The element id of a cell, for aria-activedescendant and popover anchors. */
export function gridCellId(gridId: string, cell: GridCell): string {
  return `${gridId}-${cell.row === -1 ? "h" : String(cell.row)}-${String(cell.column)}`;
}

/** The selection outline on the active cell, in the brand color: full while the grid has focus, softer when it does not. */
export const activeRing = "ring-2 ring-inset ring-brand/50 group-focus-within/grid:ring-brand";

/** The fill on selected cells beyond the active one. */
export const rangeFill = "bg-brand/10";

/** Plain strings, not cn(): a sheet renders hundreds of cells per scroll step. */
const cellBase = "absolute top-0 bottom-0 flex items-center border-r border-border/50 px-3 whitespace-nowrap";

/** Where a column's cells sit inside a row. */
export function columnPlace(offsets: readonly number[], column: number) {
  const left = offsets[column] ?? 0;
  return { left: rowNumberWidth + left, width: (offsets[column + 1] ?? left) - left };
}

/** A row's place and size; it spans the whole sheet so its line runs under every column. */
export function rowPlace(row: number, width: number) {
  return { top: row < 0 ? 0 : sheetHeaderHeight + row * sheetRowHeight, height: row < 0 ? sheetHeaderHeight : sheetRowHeight, width, minWidth: "100%" };
}

interface GridRowProps {
  row: number;
  gridId: string;
  /** The columns in view; the active column is added when it is outside them. */
  columns: Span;
  offsets: readonly number[];
  totalWidth: number;
  cell: (row: number, column: number) => string;
  rowLabel: (row: number) => string;
  /** Columns shown in tabular figures. */
  numeric: readonly boolean[];
  /** How each column's cells line up (sheet-format/rules.ts). */
  align: readonly SheetAlignment[];
  /** The banding fill for this row, or "" (every other row is banded when banding is on). */
  band: string;
  /** The active column when the active cell is in this row, else -1. */
  activeColumn: number;
  /** The active column when it is outside `columns`, else -1, so the active cell stays in the DOM while it scrolls out of view. */
  keepColumn: number;
  /** The cell editor, only for the row that holds it. */
  activeContent: ReactNode;
  /** The selected columns in this row, or -1 for both when none are (or only one cell is selected). */
  rangeLeft: number;
  rangeRight: number;
}

const alignClass: Record<SheetAlignment, string> = { left: "", center: " justify-center", right: " justify-end" };

function cellClass(editing: boolean, numeric: boolean, align: SheetAlignment, active: boolean, selected: boolean): string {
  let name = `${cellBase}${editing ? " overflow-visible" : " overflow-hidden"}${alignClass[align]}`;
  if (numeric) name += " tabular-nums";
  if (active) name += ` ${activeRing}`;
  if (selected) name += ` ${rangeFill}`;
  return name;
}

/**
 * One body row: the frozen row number, then only the cells in view, each
 * placed at its column's offset. Memoized: moving the active cell
 * re-renders only the rows it leaves and enters, as long as `cell` and
 * `rowLabel` keep their identity.
 */
export const GridRow = memo(function GridRow({ row, gridId, columns, offsets, totalWidth, cell, rowLabel, numeric, align, band, activeColumn, keepColumn, activeContent, rangeLeft, rangeRight }: GridRowProps) {
  const cells = withKept(columns, keepColumn).map((column) => {
    const value = cell(row, column);
    const isActive = column === activeColumn;
    const editing = isActive && activeContent !== undefined && activeContent !== null;
    const selected = column >= rangeLeft && column <= rangeRight;
    return (
      <div
        key={column}
        role="gridcell"
        id={gridCellId(gridId, { row, column })}
        data-cell={`${String(row)}:${String(column)}`}
        aria-colindex={column + 2}
        aria-selected={isActive || selected}
        style={columnPlace(offsets, column)}
        className={cellClass(editing, numeric[column] ?? false, align[column] ?? "left", isActive, selected && !isActive)}
      >
        {editing ? activeContent : <span className="truncate">{value}</span>}
      </div>
    );
  });
  return (
    <div role="row" data-row={row} aria-rowindex={row + 2} style={rowPlace(row, totalWidth)} className={`group/row absolute left-0 flex border-b border-border/50 hover:bg-muted/40 ${band}`}>
      <div role="rowheader" aria-colindex={1} style={{ width: rowNumberWidth }} className={`sticky left-0 z-10 flex shrink-0 items-center justify-end border-r border-border/60 bg-muted px-2 text-xs tabular-nums ${activeColumn >= 0 || rangeLeft >= 0 ? "font-medium text-foreground" : "text-muted-foreground"}`}>
        {rowLabel(row)}
      </div>
      {cells}
    </div>
  );
});
