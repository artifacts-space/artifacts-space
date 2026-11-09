"use client";

import { type ClipboardEvent, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useId, useMemo, useRef } from "react";

import type { GridCell } from "@/lib/csv-edit-rules";
import { type CellRange, type GridSelection, isSingleCell, sameCell, selectionAfterKey, selectionRange } from "@/lib/grid-selection-rules";
import { bandClass, type SheetAlignment, type SheetBanding } from "@/lib/sheet-format/rules";
import { columnOffsets, keptCell, outsideSpan, revealCell, rowNumberWidth, rowsPerPage, sheetHeaderHeight, sheetRowHeight, withKept } from "@/lib/sheet-grid-rules";
import { cn } from "@/lib/utils";

import { DropLine, HeaderRow } from "./data-grid-header";
import { gridCellId, GridRow } from "./data-grid-row";
import { useSheetFillHeight } from "./sheet-fill";
import { type ColumnResize, useColumnDrag } from "./use-column-drag";
import { useGridPointer } from "./use-grid-pointer";
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
  /** Columns shown in tabular figures. */
  numeric: readonly boolean[];
  /** How each column's cells line up; numbers right and text left when left out. */
  align?: readonly SheetAlignment[] | undefined;
  /** Every other row tinted from a theme token, or null for none. */
  banding?: SheetBanding | null | undefined;
  /** The content of a column header. */
  header: (column: number) => ReactNode;
  headerSort?: ((column: number) => "ascending" | "descending" | "none") | undefined;
  /** The text of a body cell, by shown row. Keep it stable (useCallback) so rows can skip re-rendering. */
  cell: (row: number, column: number) => string;
  /** The label in the row-number column, by shown row. Keep it stable too. */
  rowLabel: (row: number) => string;
  /** The selected block and its active cell (grid-selection-rules.ts). */
  selection: GridSelection;
  onSelectionChange: (selection: GridSelection) => void;
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
  /** A header was dragged to a new place. Without it, headers do not drag. */
  onColumnMove?: ((from: number, to: number) => void) | undefined;
  /** A header's edge was dragged to a new width, in pixels. Without it, columns do not resize. */
  onColumnResize?: ((column: number, width: number) => void) | undefined;
  /** A header's edge was double-clicked: fit the column to its content. */
  onColumnFit?: ((column: number) => void) | undefined;
}

/** Each column's alignment (numbers right and text left by default) and the banding fill. Stable unless they change, so rows keep skipping re-renders. */
function useRowLook({ numeric, align, banding }: Pick<DataGridProps, "numeric" | "align" | "banding">) {
  const autoAlign = useMemo(() => numeric.map((isNumber): SheetAlignment => (isNumber ? "right" : "left")), [numeric]);
  return { align: align ?? autoAlign, band: bandClass(banding ?? null) };
}

/** What the header row needs to move and resize columns, leaving out what the caller does not allow. */
function headerDragProps(props: DataGridProps, dragging: ReturnType<typeof useColumnDrag>) {
  return {
    drag: dragging.drag,
    onMoveStart: props.onColumnMove ? dragging.startMove : null,
    onResizeStart: props.onColumnResize ? dragging.startResize : null,
    onFit: props.onColumnFit ?? null,
    takeSwallowedClick: dragging.takeSwallowedClick,
  };
}

/**
 * Gives a hovered cell or column header its full text as a tooltip, only when it cuts
 * its text off. It writes the title on the DOM node outside React: rows are
 * reused as the sheet scrolls, so this hover check is what keeps the title
 * true, rewriting or removing it every time the pointer comes over a cell.
 */
function showClippedTitle(event: MouseEvent) {
  if (!(event.target instanceof Element)) return;
  const cell = event.target.closest<HTMLElement>("[role=gridcell], [role=columnheader]");
  // The cell's text, or a column's name inside its header buttons. A cell being edited has none.
  const text = cell?.querySelector<HTMLElement>(".truncate");
  if (!cell || !text) return;
  const value = text.textContent;
  if (value && text.scrollWidth > text.clientWidth) cell.title = value;
  else cell.removeAttribute("title");
}

/** Which way a Tab press leaves the grid instead of moving the selection. */
interface TabExit {
  forward: boolean;
  backward: boolean;
}

const noExit: TabExit = { forward: false, backward: false };
const anyExit: TabExit = { forward: true, backward: true };

function tabLeaves(exit: TabExit, event: KeyboardEvent): boolean {
  if (event.key !== "Tab") return false;
  return event.shiftKey ? exit.backward : exit.forward;
}

/** When focus comes into the grid from outside, the first Tab back toward where it came from leaves again. */
function exitOnFocus(event: FocusEvent<HTMLDivElement>): TabExit {
  const from = event.relatedTarget;
  if (event.target !== event.currentTarget || !(from instanceof Node) || event.currentTarget.contains(from)) return noExit;
  const after = (event.currentTarget.compareDocumentPosition(from) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  return { forward: after, backward: !after };
}

/** The selected columns in a row, or -1 for both when the row has none selected (or one cell is selected). */
function rowRange(range: CellRange | null, row: number) {
  if (range === null || row < range.top || row > range.bottom) return { rangeLeft: -1, rangeRight: -1 };
  return { rangeLeft: range.left, rangeRight: range.right };
}

/** Every column's width, with a default for any the caller did not size, and the width of a column being resized. */
function useOffsets(widths: readonly number[], columnCount: number, resize: ColumnResize | null = null) {
  return useMemo(() => columnOffsets(Array.from({ length: columnCount }, (_, column) => (resize?.column === column ? resize.width : widths[column] ?? 120))), [widths, columnCount, resize]);
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
  const { columnCount, rowCount, selection, onSelectionChange } = props;
  const { active } = selection;
  const ownId = useId();
  const gridId = props.gridId ?? ownId;
  const scrollerRef = useRef<HTMLDivElement>(null);
  // A click picks a cell already in view; every other move (keys, a cell editor's Enter or Tab) scrolls to it.
  const pointerMoveRef = useRef(false);
  const shownActive = useRef(active);
  const baseOffsets = useOffsets(props.widths, columnCount);
  const dragging = useColumnDrag(scrollerRef, baseOffsets, props);
  const offsets = useOffsets(props.widths, columnCount, dragging.resize);
  const view = useSheetViewport(scrollerRef, rowCount, offsets);
  const fillHeight = useSheetFillHeight(scrollerRef);
  const totalWidth = rowNumberWidth + (offsets[columnCount] ?? 0);
  const { align, band } = useRowLook(props);
  const kept = keptCell(active, rowCount, columnCount);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const moved = !sameCell(shownActive.current, active);
    shownActive.current = active;
    const fromPointer = pointerMoveRef.current;
    pointerMoveRef.current = false;
    if (!moved || fromPointer || !scroller) return;
    const next = revealCell({ top: scroller.scrollTop, left: scroller.scrollLeft, width: scroller.clientWidth, height: scroller.clientHeight }, active, offsets);
    if (next.top !== scroller.scrollTop || next.left !== scroller.scrollLeft) scroller.scrollTo({ top: next.top, left: next.left });
  }, [active, offsets]);

  function selectByPointer(next: GridSelection) {
    pointerMoveRef.current = true;
    onSelectionChange(next);
  }

  const pointer = useGridPointer({ selection, onSelectionChange: selectByPointer, onActiveClick: props.onActiveClick });
  const { cell } = props;
  const isBlank = (at: GridCell) => at.row >= 0 && cell(at.row, at.column) === "";

  // With Tab moving between cells, keyboard users still get out: Escape then Tab leaves either way, and
  // the first Tab back the way focus came in leaves too, so Shift+Tab then Tab returns where it started.
  const leaveRef = useRef<TabExit>(noExit);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (props.onGridKeyDown?.(event) || event.defaultPrevented) return;
    const leaving = tabLeaves(leaveRef.current, event);
    leaveRef.current = event.key === "Escape" ? anyExit : noExit;
    if (leaving) return;
    const page = rowsPerPage(scrollerRef.current?.clientHeight ?? 0);
    const next = selectionAfterKey(event, selection, { rows: rowCount, columns: columnCount, page }, isBlank, props.tabMoves ?? false);
    if (next === null) return;
    event.preventDefault();
    onSelectionChange(next);
  }

  const range = isSingleCell(selection) ? null : selectionRange(selection);

  const columns = withKept(view.columns, kept.column);
  const rows = withKept(view.rows, kept.row);

  return (
    <div className="min-w-0">
      <div
        ref={scrollerRef}
        role="grid"
        tabIndex={0}
        aria-label={props.label}
        aria-describedby={props.describedBy}
        aria-rowcount={rowCount + 1}
        aria-colcount={columnCount + 1}
        aria-multiselectable
        aria-activedescendant={kept.column === -1 ? undefined : gridCellId(gridId, active)}
        onKeyDown={handleKeyDown}
        onFocus={(event) => { leaveRef.current = exitOnFocus(event); }}
        onPointerDown={pointer.onPointerDown}
        onClick={pointer.onClick}
        onPaste={props.onPaste}
        onCopy={props.onCopy}
        onMouseOver={showClippedTitle}
        style={fillHeight === null ? undefined : { maxHeight: fillHeight }}
        // 70vh tall at most, unless it fills an artifact page; the /app shell lowers it with --data-grid-max-height to fit the pane.
        className={cn("group/grid relative isolate min-w-0 overflow-auto select-none overscroll-x-contain border border-border/70 bg-card text-sm outline-none", fillHeight === null && "max-h-[var(--data-grid-max-height,70vh)]")}
      >
        <div role="presentation" className="relative" style={{ width: totalWidth, minWidth: "100%", height: sheetHeaderHeight + rowCount * sheetRowHeight }}>
          <HeaderRow
            gridId={gridId}
            columns={columns}
            offsets={offsets}
            totalWidth={totalWidth}
            active={active}
            range={range}
            activeContent={props.activeContent}
            header={props.header}
            headerSort={props.headerSort}
            {...headerDragProps(props, dragging)}
          />
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
                align={align}
                band={row % 2 === 1 ? band : ""}
                activeColumn={isActiveRow ? active.column : -1}
                {...rowRange(range, row)}
                keepColumn={outsideSpan(view.columns, kept.column)}
                activeContent={isActiveRow ? props.activeContent : null}
              />
            );
          })}
          <DropLine drag={dragging.drag} offsets={offsets} />
        </div>
      </div>
      {/* Outside the grid, which holds only rows. */}
      {rowCount === 0 && props.empty ? <p className="border-x border-b border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">{props.empty}</p> : null}
    </div>
  );
}
