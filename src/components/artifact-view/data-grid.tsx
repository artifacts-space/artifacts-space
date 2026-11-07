"use client";

import { type ClipboardEvent, type KeyboardEvent, memo, type MouseEvent, type ReactNode, useEffect, useId, useRef } from "react";

import type { GridCell } from "@/lib/csv-edit-rules";
import { keyToMove, moveCell } from "@/lib/grid-navigation";
import { cn } from "@/lib/utils";

import { useVirtualRows } from "./use-virtual-rows";

export interface DataGridProps {
  /** Base for cell element ids. Pass one to anchor popovers to header cells. */
  gridId?: string | undefined;
  /** Accessible name of the grid. */
  label: string;
  /** Id of the text that explains the keys. */
  describedBy?: string | undefined;
  columnCount: number;
  rowCount: number;
  /** Column widths in `ch`. */
  widths: readonly number[];
  /** Columns shown right-aligned in tabular figures. */
  numeric: readonly boolean[];
  /** The content of a column header. */
  header: (column: number) => ReactNode;
  headerSort?: ((column: number) => "ascending" | "descending" | "none") | undefined;
  /** The text of a body cell, by shown row. Keep it stable (useCallback) so rows can skip re-rendering. */
  cell: (row: number, column: number) => string;
  /** The label in the row-number column, by shown row. Keep it stable too. */
  rowLabel: (row: number) => string;
  active: GridCell;
  onActiveChange: (cell: GridCell) => void;
  /** Runs before the grid's own keys. Return true when the key was handled. */
  onGridKeyDown?: ((event: KeyboardEvent<HTMLTableElement>) => boolean) | undefined;
  /** Shown in place of the active cell's text, such as a cell editor. */
  activeContent?: ReactNode;
  /** A click on the cell that is already active, such as to start editing. */
  onActiveClick?: ((cell: GridCell) => void) | undefined;
  onPaste?: ((event: ClipboardEvent<HTMLTableElement>) => void) | undefined;
  onCopy?: ((event: ClipboardEvent<HTMLTableElement>) => void) | undefined;
  /** Tab moves between cells, as in a spreadsheet. Otherwise Tab leaves the grid. */
  tabMoves?: boolean;
  /** Shown under the header when there are no rows. */
  empty?: ReactNode;
}

/** The element id of a cell, for aria-activedescendant and popover anchors. */
export function gridCellId(gridId: string, cell: GridCell): string {
  return `${gridId}-${cell.row === -1 ? "h" : String(cell.row)}-${String(cell.column)}`;
}

function cellFromEvent(event: MouseEvent): GridCell | null {
  if (!(event.target instanceof Element)) return null;
  const element = event.target.closest<HTMLElement>("[data-cell]");
  if (!element) return null;
  const [row, column] = (element.dataset.cell ?? "").split(":").map(Number);
  if (row === undefined || column === undefined || Number.isNaN(row) || Number.isNaN(column)) return null;
  return { row, column };
}

const sameCell = (a: GridCell, b: GridCell) => a.row === b.row && a.column === b.column;

const rowNumberWidth = "3.25rem";

/** Width of a column: its text width plus the cell's side padding. */
const columnWidth = (width: number) => `calc(${String(width)}ch + 1.5rem)`;

const activeRing = "group-focus-within/grid:ring-2 group-focus-within/grid:ring-ring group-focus-within/grid:ring-inset";

/** Plain strings, not cn(): a 1,000-row grid renders thousands of cells. */
const cellBase = "relative h-8 scroll-mt-9 scroll-ml-[3.25rem] border-r border-b border-border/50 px-3 whitespace-nowrap last:border-r-0 group-hover/row:bg-muted/50";

/**
 * A spreadsheet-style table: sticky header and row numbers, fixed column
 * widths, hairline grid lines, and one active cell moved with the arrow
 * keys, Home, End, and Page Up or Down. Long tables render only the rows
 * near the screen. The table holds focus and points at the active cell
 * with aria-activedescendant, so rows can come and go while scrolling.
 */
export function DataGrid(props: DataGridProps) {
  const { columnCount, rowCount, active, onActiveChange } = props;
  const ownId = useId();
  const gridId = props.gridId ?? ownId;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef(false);
  const rows = useVirtualRows(scrollerRef, rowCount);
  const activeShown = active.row === -1 || (active.row >= rows.start && active.row < rows.end);

  useEffect(() => {
    if (!revealRef.current) return;
    const element = document.getElementById(gridCellId(gridId, active));
    if (element) {
      revealRef.current = false;
      element.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
    const scroller = scrollerRef.current;
    if (scroller && rows.rowHeight > 0) scroller.scrollTop = active.row * rows.rowHeight - scroller.clientHeight / 2;
  }, [gridId, active, rows.start, rows.rowHeight]);

  function moveTo(cell: GridCell) {
    revealRef.current = true;
    onActiveChange(cell);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    if (props.onGridKeyDown?.(event) || event.defaultPrevented) return;
    if (event.altKey || (event.key === "Tab" && !props.tabMoves)) return;
    const move = keyToMove(event.key, { shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey });
    if (move === null) return;
    const next = moveCell(active, move, { rows: rowCount, columns: columnCount });
    if (next === null) return;
    event.preventDefault();
    moveTo(next);
  }

  function handleClick(event: MouseEvent<HTMLTableElement>) {
    const cell = cellFromEvent(event);
    if (cell === null) return;
    if (sameCell(cell, active)) props.onActiveClick?.(cell);
    else onActiveChange(cell);
  }

  const columns = Array.from({ length: columnCount }, (_, column) => column);
  const totalWidth = `calc(${rowNumberWidth} + ${columns.map((column) => columnWidth(props.widths[column] ?? 12)).join(" + ") || "0px"})`;

  return (
    <div ref={scrollerRef} className="max-h-[70vh] overflow-auto overscroll-contain rounded-xl border border-border/70 bg-card shadow-sm">
      <table
        role="grid"
        tabIndex={0}
        aria-label={props.label}
        aria-describedby={props.describedBy}
        aria-rowcount={rowCount + 1}
        aria-colcount={columnCount + 1}
        aria-activedescendant={activeShown ? gridCellId(gridId, active) : undefined}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        onPaste={props.onPaste}
        onCopy={props.onCopy}
        style={{ width: totalWidth }}
        className="group/grid min-w-full table-fixed border-separate border-spacing-0 text-sm outline-none"
      >
        <colgroup>
          <col style={{ width: rowNumberWidth }} />
          {columns.map((column) => <col key={column} style={{ width: columnWidth(props.widths[column] ?? 12) }} />)}
        </colgroup>
        <thead className="sticky top-0 z-20">
          <tr aria-rowindex={1}>
            <th scope="col" aria-colindex={1} className="sticky left-0 z-10 h-9 border-r border-b border-border/60 bg-card px-2 text-right text-xs font-normal text-muted-foreground/70">
              <span className="sr-only">Row</span>#
            </th>
            {columns.map((column) => (
              <th
                key={column}
                id={gridCellId(gridId, { row: -1, column })}
                data-cell={`-1:${String(column)}`}
                scope="col"
                aria-colindex={column + 2}
                aria-sort={props.headerSort?.(column)}
                aria-selected={sameCell(active, { row: -1, column })}
                className={cn(
                  "h-9 border-r border-b border-border/60 bg-card p-0 text-left font-medium text-muted-foreground last:border-r-0",
                  sameCell(active, { row: -1, column }) && activeRing,
                )}
              >
                {sameCell(active, { row: -1, column }) && props.activeContent ? <div className="relative h-9">{props.activeContent}</div> : props.header(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.padTop > 0 ? <tr aria-hidden style={{ height: rows.padTop }} /> : null}
          {Array.from({ length: rows.end - rows.start }, (_, offset) => {
            const row = rows.start + offset;
            const isActiveRow = row === active.row;
            return (
              <GridRow
                key={row}
                row={row}
                gridId={gridId}
                columnCount={columnCount}
                cell={props.cell}
                rowLabel={props.rowLabel}
                numeric={props.numeric}
                activeColumn={isActiveRow ? active.column : -1}
                activeContent={isActiveRow ? props.activeContent : null}
              />
            );
          })}
          {rows.padBottom > 0 ? <tr aria-hidden style={{ height: rows.padBottom }} /> : null}
        </tbody>
      </table>
      {rowCount === 0 && props.empty ? <div className="sticky left-0 px-4 py-6 text-center text-sm text-muted-foreground">{props.empty}</div> : null}
    </div>
  );
}

interface GridRowProps {
  row: number;
  gridId: string;
  columnCount: number;
  cell: DataGridProps["cell"];
  rowLabel: DataGridProps["rowLabel"];
  numeric: DataGridProps["numeric"];
  /** The active column when the active cell is in this row, else -1. */
  activeColumn: number;
  /** The cell editor, only for the row that holds it. */
  activeContent: ReactNode;
}

/**
 * One body row. Memoized: moving the active cell re-renders only the rows it
 * leaves and enters, as long as `cell` and `rowLabel` keep their identity.
 */
const GridRow = memo(function GridRow({ row, gridId, columnCount, cell, rowLabel, numeric, activeColumn, activeContent }: GridRowProps) {
  const cells: ReactNode[] = [];
  for (let column = 0; column < columnCount; column += 1) {
    const value = cell(row, column);
    const isActive = column === activeColumn;
    const editing = isActive && activeContent !== undefined && activeContent !== null;
    cells.push(
      <td
        key={column}
        id={gridCellId(gridId, { row, column })}
        data-cell={`${String(row)}:${String(column)}`}
        aria-colindex={column + 2}
        aria-selected={isActive}
        title={value.length > 24 && !editing ? value : undefined}
        className={`${cellBase} ${editing ? "overflow-visible" : "overflow-hidden text-ellipsis"}${numeric[column] ? " text-right tabular-nums" : ""}${isActive ? ` ${activeRing}` : ""}`}
      >
        {editing ? activeContent : value}
      </td>,
    );
  }
  return (
    <tr data-row={row} aria-rowindex={row + 2} className="group/row">
      <th scope="row" aria-colindex={1} className="sticky left-0 z-10 h-8 border-r border-b border-border/50 bg-card px-2 text-right text-xs font-normal text-muted-foreground/70 tabular-nums group-hover/row:bg-muted">
        {rowLabel(row)}
      </th>
      {cells}
    </tr>
  );
});
