"use client";

import { type ClipboardEvent, type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useId, useMemo, useRef } from "react";

import type { GridCell } from "@/lib/csv-edit-rules";
import { type GridBounds, keyToMove, moveCell } from "@/lib/grid-navigation";
import { columnOffsets, revealCell, rowNumberWidth, rowsPerPage, sheetHeaderHeight, sheetRowHeight, withKept } from "@/lib/sheet-grid-rules";
import { cn } from "@/lib/utils";

import { activeRing, columnPlace, gridCellId, GridRow, rowPlace } from "./data-grid-row";
import { useSheetFillHeight } from "./sheet-fill";
import { useSheetViewport } from "./use-sheet-viewport";

export { gridCellId } from "./data-grid-row";

export interface DataGridProps {
  /** Base for cell element ids. Pass one to anchor popovers to header cells. */
  gridId?: string | undefined;
  /** Accessible name of the grid. */
  label: string;
  /** Id of the text that explains the keys. */
  describedBy?: string | undefined;
  columnCount: number;
  rowCount: number;
  /** Column widths in pixels (sheet-grid-rules.ts). */
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
  onGridKeyDown?: ((event: KeyboardEvent<HTMLDivElement>) => boolean) | undefined;
  /** Shown in place of the active cell's text, such as a cell editor. */
  activeContent?: ReactNode;
  /** A click on the cell that is already active, such as to start editing. */
  onActiveClick?: ((cell: GridCell) => void) | undefined;
  onPaste?: ((event: ClipboardEvent<HTMLDivElement>) => void) | undefined;
  onCopy?: ((event: ClipboardEvent<HTMLDivElement>) => void) | undefined;
  /** Tab moves between cells, as in a spreadsheet. Otherwise Tab leaves the grid. */
  tabMoves?: boolean;
  /** Shown under the header when there are no rows. */
  empty?: ReactNode;
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

/** The active cell's row and column, always rendered so it stays in the DOM; -1 for each when there is no active cell. */
function keptCell(active: GridCell, rowCount: number, columnCount: number): GridCell {
  if (columnCount === 0 || active.row >= rowCount) return { row: -1, column: -1 };
  return active;
}

/** Where a key press moves the active cell, or null when the grid leaves the key alone. */
function keyTarget(event: KeyboardEvent, active: GridCell, bounds: GridBounds, tabMoves: boolean): GridCell | null {
  if (event.altKey || (event.key === "Tab" && !tabMoves)) return null;
  const move = keyToMove(event.key, { shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey });
  return move === null ? null : moveCell(active, move, bounds);
}

/** Every column's width, with a default for any the caller did not size. */
function useOffsets(widths: readonly number[], columnCount: number) {
  return useMemo(() => columnOffsets(Array.from({ length: columnCount }, (_, column) => widths[column] ?? 120)), [widths, columnCount]);
}

/**
 * A spreadsheet grid: a frozen header row and row-number column, fixed
 * column widths, hairline grid lines, and one active cell moved with the
 * arrow keys, Tab, Home, End, and Page Up or Down. Only the rows and
 * columns in view are in the DOM (use-sheet-viewport.ts), so a sheet at the
 * size limit scrolls smoothly. The grid holds focus and points at the
 * active cell with aria-activedescendant, so cells can come and go while
 * scrolling. On an artifact's page it fills the window (sheet-fill.tsx).
 */
export function DataGrid(props: DataGridProps) {
  const { columnCount, rowCount, active, onActiveChange } = props;
  const ownId = useId();
  const gridId = props.gridId ?? ownId;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef(false);
  const offsets = useOffsets(props.widths, columnCount);
  const view = useSheetViewport(scrollerRef, rowCount, offsets);
  const fillHeight = useSheetFillHeight(scrollerRef);
  const totalWidth = rowNumberWidth + (offsets[columnCount] ?? 0);
  const kept = keptCell(active, rowCount, columnCount);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!revealRef.current || !scroller) return;
    revealRef.current = false;
    const next = revealCell({ top: scroller.scrollTop, left: scroller.scrollLeft, width: scroller.clientWidth, height: scroller.clientHeight }, active, offsets);
    if (next.top !== scroller.scrollTop || next.left !== scroller.scrollLeft) scroller.scrollTo({ top: next.top, left: next.left });
  }, [active, offsets]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (props.onGridKeyDown?.(event) || event.defaultPrevented) return;
    const page = rowsPerPage(scrollerRef.current?.clientHeight ?? 0);
    const next = keyTarget(event, active, { rows: rowCount, columns: columnCount, page }, props.tabMoves ?? false);
    if (next === null) return;
    event.preventDefault();
    revealRef.current = true;
    onActiveChange(next);
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const cell = cellFromEvent(event);
    if (cell === null) return;
    if (sameCell(cell, active)) props.onActiveClick?.(cell);
    else onActiveChange(cell);
  }

  const columns = withKept(view.columns, kept.column);
  const rows = withKept(view.rows, kept.row);

  return (
    <div
      ref={scrollerRef}
      role="grid"
      tabIndex={0}
      aria-label={props.label}
      aria-describedby={props.describedBy}
      aria-rowcount={rowCount + 1}
      aria-colcount={columnCount + 1}
      aria-activedescendant={kept.column === -1 ? undefined : gridCellId(gridId, active)}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
      onPaste={props.onPaste}
      onCopy={props.onCopy}
      style={fillHeight === null ? undefined : { maxHeight: fillHeight }}
      // 70vh tall at most, unless it fills an artifact page; the /app shell lowers it with --data-grid-max-height to fit the pane.
      className={cn("group/grid relative min-w-0 overflow-auto overscroll-x-contain border border-border/70 bg-card text-sm outline-none", fillHeight === null && "max-h-[var(--data-grid-max-height,70vh)]")}
    >
      <div role="presentation" className="relative" style={{ width: totalWidth, minWidth: "100%", height: sheetHeaderHeight + rowCount * sheetRowHeight }}>
        <HeaderRow gridId={gridId} columns={columns} offsets={offsets} totalWidth={totalWidth} active={active} activeContent={props.activeContent} header={props.header} headerSort={props.headerSort} />
        {rows.map((row) => {
          const isActiveRow = row === active.row;
          return (
            <GridRow
              key={row}
              row={row}
              gridId={gridId}
              columns={view.columns}
              offsets={offsets}
              totalWidth={totalWidth}
              cell={props.cell}
              rowLabel={props.rowLabel}
              numeric={props.numeric}
              activeColumn={isActiveRow ? active.column : -1}
              keepColumn={kept.column}
              activeContent={isActiveRow ? props.activeContent : null}
            />
          );
        })}
      </div>
      {rowCount === 0 && props.empty ? <div className="sticky left-0 px-4 py-6 text-center text-sm text-muted-foreground">{props.empty}</div> : null}
    </div>
  );
}

interface HeaderRowProps extends Pick<DataGridProps, "header" | "headerSort" | "active" | "activeContent"> {
  gridId: string;
  columns: readonly number[];
  offsets: readonly number[];
  totalWidth: number;
}

/** The frozen header row: the row-number corner, then the column names in view. */
function HeaderRow({ gridId, columns, offsets, totalWidth, active, activeContent, header, headerSort }: HeaderRowProps) {
  return (
    <div role="row" aria-rowindex={1} style={rowPlace(-1, totalWidth)} className="sticky top-0 z-20 flex border-b border-border/60 bg-muted">
      <div role="columnheader" aria-colindex={1} style={{ width: rowNumberWidth }} className="sticky left-0 z-10 flex shrink-0 items-center justify-end border-r border-border/60 bg-muted px-2 text-xs text-muted-foreground/70">
        <span className="sr-only">Row</span>#
      </div>
      {columns.map((column) => {
        const isActive = sameCell(active, { row: -1, column });
        const editing = isActive && activeContent !== undefined && activeContent !== null;
        return (
          <div
            key={column}
            role="columnheader"
            id={gridCellId(gridId, { row: -1, column })}
            data-cell={`-1:${String(column)}`}
            aria-colindex={column + 2}
            aria-sort={headerSort?.(column)}
            aria-selected={isActive}
            style={columnPlace(offsets, column)}
            className={cn("absolute top-0 bottom-0 border-r border-border/60 text-left font-medium text-muted-foreground", editing ? "overflow-visible" : "overflow-hidden", isActive && activeRing)}
          >
            {editing ? <div className="relative h-full">{activeContent}</div> : header(column)}
          </div>
        );
      })}
    </div>
  );
}
