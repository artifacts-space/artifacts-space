"use client";

import type { MouseEvent, PointerEvent, ReactNode } from "react";

import type { GridCell } from "@/lib/csv-edit-rules";
import { dropLineX } from "@/lib/sheet-column-rules";
import { rowNumberWidth } from "@/lib/sheet-grid-rules";
import { cn } from "@/lib/utils";

import { activeRing, columnPlace, gridCellId, rowPlace } from "./data-grid-row";
import type { ColumnDrag } from "./use-column-drag";

export interface HeaderRowProps {
  gridId: string;
  columns: readonly number[];
  offsets: readonly number[];
  totalWidth: number;
  active: GridCell;
  activeContent: ReactNode;
  header: (column: number) => ReactNode;
  headerSort?: ((column: number) => "ascending" | "descending" | "none") | undefined;
  drag: ColumnDrag | null;
  /** Null when columns cannot be moved here. */
  onMoveStart: ((column: number, event: PointerEvent) => void) | null;
  /** Null when columns cannot be resized here. */
  onResizeStart: ((column: number, event: PointerEvent) => void) | null;
  onFit: ((column: number) => void) | null;
  /** True once after a drag ends, so the click that ends it does not also sort. */
  takeSwallowedClick: () => boolean;
}

/** A column's right edge: drag to resize, double-click to fit the content. Mouse and pen only, so it is hidden on touch screens. */
function ResizeHandle({ column, onResizeStart, onFit }: { column: number; onResizeStart: (column: number, event: PointerEvent) => void; onFit: ((column: number) => void) | null }) {
  return (
    <div
      aria-hidden
      data-resize-handle={column}
      onPointerDown={(event) => { onResizeStart(column, event); }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onFit?.(column);
      }}
      onClick={(event) => { event.stopPropagation(); }}
      className="absolute top-0 right-0 bottom-0 z-10 w-1.5 cursor-col-resize hover:bg-foreground/20 pointer-coarse:hidden"
    />
  );
}

/**
 * The frozen header row: the row-number corner, then the column names in
 * view. With a mouse, a header drags to move its column and its right
 * edge drags to resize it; while a column moves, a line shows where it
 * will land.
 */
export function HeaderRow(props: HeaderRowProps) {
  const { columns, totalWidth } = props;

  function swallowDragClick(event: MouseEvent) {
    if (!props.takeSwallowedClick()) return;
    event.stopPropagation();
    event.preventDefault();
  }

  return (
    <div role="row" aria-rowindex={1} style={rowPlace(-1, totalWidth)} onClickCapture={swallowDragClick} className="sticky top-0 z-20 flex border-b border-border/60 bg-muted">
      <div role="columnheader" aria-colindex={1} style={{ width: rowNumberWidth }} className="sticky left-0 z-20 flex shrink-0 items-center justify-end border-r border-border/60 bg-muted px-2 text-xs text-muted-foreground/70">
        <span className="sr-only">Row</span>#
      </div>
      {columns.map((column) => <HeaderCell key={column} column={column} row={props} />)}
    </div>
  );
}

const hasContent = (content: ReactNode) => content !== undefined && content !== null;

function headerClass(editing: boolean, active: boolean, dragged: boolean) {
  return cn(
    "absolute top-0 bottom-0 border-r border-border/60 text-left font-medium text-muted-foreground",
    editing ? "overflow-visible" : "overflow-hidden",
    active && activeRing,
    dragged && "opacity-50",
  );
}

/** One column's header: its name and controls, or the editor while it is renamed. */
function HeaderCell({ column, row }: { column: number; row: HeaderRowProps }) {
  const { active, activeContent, onMoveStart, onResizeStart } = row;
  const isActive = active.row === -1 && active.column === column;
  const editing = isActive && hasContent(activeContent);
  const movable = !editing && onMoveStart !== null;
  const resizable = !editing && onResizeStart !== null;
  return (
    <div
      role="columnheader"
      id={gridCellId(row.gridId, { row: -1, column })}
      data-cell={`-1:${String(column)}`}
      aria-colindex={column + 2}
      aria-sort={row.headerSort?.(column)}
      aria-selected={isActive}
      style={columnPlace(row.offsets, column)}
      onPointerDown={movable ? (event) => { onMoveStart(column, event); } : undefined}
      className={headerClass(editing, isActive, row.drag?.from === column)}
    >
      {editing ? <div className="relative h-full">{activeContent}</div> : row.header(column)}
      {resizable ? <ResizeHandle column={column} onResizeStart={onResizeStart} onFit={row.onFit} /> : null}
    </div>
  );
}

/** The line that shows where a dragged column will land, over the whole height of the grid. */
export function DropLine({ drag, offsets }: { drag: ColumnDrag | null; offsets: readonly number[] }) {
  if (!drag || drag.to === drag.from) return null;
  return <div aria-hidden data-drop-line="" style={{ left: rowNumberWidth + dropLineX(offsets, drag.from, drag.to) - 1 }} className="pointer-events-none absolute top-0 bottom-0 z-30 w-0.5 bg-foreground/70" />;
}
