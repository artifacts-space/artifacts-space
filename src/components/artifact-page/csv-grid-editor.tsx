"use client";

import { IconArrowBackUp, IconChevronDown, IconColumnInsertRight, IconColumnRemove, IconRowInsertBottom, IconRowRemove } from "@tabler/icons-react";
import { type ClipboardEvent, type KeyboardEvent, type ReactNode, useCallback, useId, useMemo, useRef, useState } from "react";

import { DataGrid, gridCellId } from "@/components/artifact-view/data-grid";
import { SheetFormatMenu } from "@/components/artifact-view/sheet-format";
import { SheetFormulaBar } from "@/components/artifact-view/sheet-formula-bar";
import { useSheetColumns } from "@/components/artifact-view/use-sheet-columns";
import { copySelection, selectionLabel, useSheetSelection } from "@/components/artifact-view/use-sheet-selection";
import { Button } from "@/components/ui/button";
import type { CsvTextStyle } from "@/lib/csv";
import { gridEditKey } from "@/lib/csv-edit-keys";
import {
  cellValue,
  deleteColumn,
  deleteRow,
  type GridCell,
  gridWidth,
  insertColumn,
  insertRow,
  pasteBlock,
  setCell,
} from "@/lib/csv-edit-rules";
import { detectColumnTypes } from "@/lib/csv-values";
import { columnWidths } from "@/lib/csv-view-rules";
import { moveCell } from "@/lib/grid-navigation";
import { clearRange, parsePasteBlock, pastePlan, selectionRange, singleCell } from "@/lib/grid-selection-rules";
import { moveColumn } from "@/lib/sheet-column-rules";
import { pixelWidth } from "@/lib/sheet-grid-rules";

import { type CellCommitMove, CsvCellEditor } from "./csv-cell-editor";
import { type ColumnAction, CsvEditMenu } from "./csv-edit-menu";
import { useCsvGrid } from "./use-csv-grid";

interface CsvGridEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** The file's separator and line breaks, kept on every save. */
  style: CsvTextStyle;
  /** The Grid and Raw switch, shown at the start of the toolbar. */
  modeSwitch: ReactNode;
}

interface Editing {
  cell: GridCell;
  draft: string;
}

const rowNumber = (row: number) => String(row + 1);

/** Default column widths from the content, and which columns hold numbers. */
function useColumnDefaults(grid: { header: readonly string[]; rows: readonly (readonly string[])[] }, width: number) {
  return useMemo(() => ({
    widths: columnWidths(grid.header, grid.rows, width).map(pixelWidth),
    numeric: detectColumnTypes(grid.rows, width).map((type) => type === "number"),
  }), [grid.header, grid.rows, width]);
}

const cellsLabel = (rows: number, columns: number) => `${String(rows)} ${rows === 1 ? "row" : "rows"} × ${String(columns)} ${columns === 1 ? "column" : "columns"}`;

/**
 * Edits a CSV like a spreadsheet: click a cell twice, press Enter, or just
 * type to edit; arrows and Tab move; paste a block from Sheets or Excel; add
 * and delete rows and columns; rename a column from its header. Every
 * change is written back to the CSV text that the editor saves.
 */
export function CsvGridEditor({ value, onChange, style, modeSwitch }: CsvGridEditorProps) {
  const { grid, apply, undo, redo } = useCsvGrid(value, onChange, style);
  const width = gridWidth(grid);
  const { selection, active, setSelection, setActive } = useSheetSelection({ rows: grid.rows.length, columns: width });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [menuColumn, setMenuColumn] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const gridId = useId();
  const hintId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLElement | null>(null);
  const tabLeavesRef = useRef(false);
  const { widths, numeric } = useColumnDefaults(grid, width);
  const cellText = useCallback((row: number, column: number) => grid.rows[row]?.[column] ?? "", [grid.rows]);
  const sheet = useSheetColumns({ header: grid.header, rows: grid.rows, columnCount: width, defaults: widths, numeric, localOrder: false });

  const focusGrid = () => { wrapperRef.current?.querySelector<HTMLElement>("[role=grid]")?.focus({ preventScroll: true }); };
  const startEdit = (cell: GridCell, draft = cellValue(grid, cell)) => { setStatus(""); setEditing({ cell, draft }); };

  function commit(move: CellCommitMove) {
    if (!editing) return;
    const { cell, draft } = editing;
    apply((current) => setCell(current, cell, draft));
    setEditing(null);
    if (move !== "none") {
      setActive(moveCell(editing.cell, move, { rows: grid.rows.length, columns: width }) ?? editing.cell);
      focusGrid();
    }
  }

  function cancel() {
    setEditing(null);
    focusGrid();
  }

  function openMenu(column: number) {
    tableRef.current = wrapperRef.current?.querySelector<HTMLElement>("[role=grid]") ?? null;
    setActive({ row: -1, column });
    setMenuColumn(column);
  }

  function runColumnAction(action: ColumnAction, column: number) {
    if (action === "rename") {
      startEdit({ row: -1, column });
      return;
    }
    if (action === "delete") {
      apply((current) => deleteColumn(current, column));
      return;
    }
    const at = action === "insertLeft" ? column : column + 1;
    apply((current) => insertColumn(current, at));
    setActive({ row: active.row, column: at });
  }

  function handleGridKey(event: KeyboardEvent<HTMLDivElement>): boolean {
    const action = gridEditKey(event);
    const leaving = tabLeavesRef.current && event.key === "Tab";
    tabLeavesRef.current = action === "escape";
    if (leaving) return true;
    if (action === null) return false;
    event.preventDefault();
    if (action === "undo") undo();
    else if (action === "redo") redo();
    else if (action === "menu") openMenu(active.column);
    else if (action === "edit") startEdit(active);
    else if (action === "clear") apply((current) => clearRange(current, selectionRange(selection)));
    else if (action === "type") startEdit(active, event.key);
    return true;
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const text = event.clipboardData.getData("text/plain");
    if (editing || text === "") return;
    event.preventDefault();
    const plan = pastePlan(selectionRange(selection), parsePasteBlock(text));
    const rows = plan.block.length;
    const columns = plan.block.reduce((widest, line) => Math.max(widest, line.length), 0);
    if (rows === 0 || columns === 0) return;
    apply((current) => pasteBlock(current, plan.at, plan.block).grid);
    // The pasted block stays selected, as in a spreadsheet.
    setSelection({ anchor: plan.at, active: { row: plan.at.row + rows - 1, column: plan.at.column + columns - 1 } });
    setStatus(`Pasted ${cellsLabel(rows, columns)}.`);
  }

  const gridOf = (column: number) => document.getElementById(gridCellId(gridId, { row: -1, column }))?.closest("[role=grid]") ?? null;

  /** Moves a column in the file, as a spreadsheet does; the move saves like any other edit. */
  function moveFileColumn(from: number, to: number) {
    apply((current) => moveColumn(current, from, to));
    setActive((current) => (current.column === from ? { ...current, column: to } : current));
    setStatus(`Moved “${columnName(from) || "Untitled"}”. Everyone sees the new order.`);
  }

  function layoutFor(column: number) {
    const moveTo = (to: number) => () => { moveFileColumn(column, to); setMenuColumn(to); };
    return {
      onMoveLeft: column > 0 ? moveTo(column - 1) : null,
      onMoveRight: column < width - 1 ? moveTo(column + 1) : null,
      onFit: () => { sheet.fit(column, gridOf(column)); },
      align: sheet.alignControl(column),
    };
  }

  const addRow = () => {
    const at = active.row + 1;
    apply((current) => insertRow(current, at));
    setActive({ row: at, column: active.column });
  };

  const columnName = (column: number) => grid.header[column] ?? "";
  const editor = editing ? (
    <CsvCellEditor
      value={editing.draft}
      onChange={(draft) => { setEditing({ ...editing, draft }); }}
      onCommit={commit}
      onCancel={cancel}
      label={editing.cell.row === -1 ? `Column name, column ${String(editing.cell.column + 1)}` : `${columnName(editing.cell.column) || "Cell"}, row ${String(editing.cell.row + 1)}`}
    />
  ) : null;

  return (
    <div ref={wrapperRef} className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {modeSwitch}
        <div role="toolbar" aria-label="Rows and columns" className="flex flex-wrap items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={addRow} disabled={width === 0} aria-label="Add row"><IconRowInsertBottom /> Row</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => { runColumnAction("insertRight", active.column); }} aria-label="Add column"><IconColumnInsertRight /> Column</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => { apply((current) => deleteRow(current, active.row)); }} disabled={active.row === -1 || grid.rows.length === 0} aria-label="Delete row"><IconRowRemove /><span className="hidden sm:inline">Delete row</span></Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => { apply((current) => deleteColumn(current, active.column)); }} disabled={width <= 1} aria-label="Delete column"><IconColumnRemove /><span className="hidden sm:inline">Delete column</span></Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => { undo(); focusGrid(); }} aria-label="Undo"><IconArrowBackUp /></Button>
        </div>
        <SheetFormatMenu />
        <p role="status" className="ml-auto text-sm text-muted-foreground">{status}</p>
      </div>
      <div className="min-w-0">
      <SheetFormulaBar
        place={selectionLabel(selection, columnName, rowNumber)}
        value={cellValue(grid, active)}
        onCommit={(next) => { const at = active; apply((current) => setCell(current, at, next)); }}
        onDone={focusGrid}
      />
      <DataGrid
        gridId={gridId}
        label="CSV grid editor"
        describedBy={hintId}
        columnCount={width}
        rowCount={grid.rows.length}
        widths={sheet.widths}
        numeric={sheet.numeric}
        align={sheet.align}
        banding={sheet.banding}
        onColumnMove={moveFileColumn}
        onColumnResize={sheet.resize}
        onColumnFit={(column) => { sheet.fit(column, gridOf(column)); }}
        header={(column) => <EditorHeader name={columnName(column)} onMenu={() => { openMenu(column); }} />}
        cell={cellText}
        rowLabel={rowNumber}
        selection={editing ? singleCell(editing.cell) : selection}
        onSelectionChange={(next) => { setStatus(""); setSelection(next); }}
        onActiveClick={(cell) => { if (!editing) startEdit(cell); }}
        onGridKeyDown={handleGridKey}
        activeContent={editor}
        onPaste={handlePaste}
        onCopy={(event) => { copySelection(event, selection, (cell) => cellValue(grid, cell)); }}
        tabMoves
        empty={width === 0 ? "This CSV is empty. Add a column to start." : "No rows yet. Add a row to start."}
      />
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        Double-click a cell, press Enter, or start typing to edit. Shift with the arrows selects a block to copy, paste over, or clear. Paste from Sheets, Excel, or a CSV to fill many cells. To leave the grid, press Escape, then Tab.
      </p>
      {menuColumn !== null ? (
        <CsvEditMenu
          onClose={() => { setMenuColumn(null); }}
          anchor={() => document.getElementById(gridCellId(gridId, { row: -1, column: menuColumn }))}
          returnFocus={tableRef}
          name={columnName(menuColumn)}
          onAction={(action) => { runColumnAction(action, menuColumn); }}
          layout={layoutFor(menuColumn)}
        />
      ) : null}
    </div>
  );
}

function EditorHeader({ name, onMenu }: { name: string; onMenu: () => void }) {
  return (
    <div className="group/header flex h-full items-center">
      <span className="min-w-0 flex-1 truncate pr-1 pl-3">{name || <span className="text-muted-foreground/60">Untitled</span>}</span>
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Edit column ${name || "options"}`}
        aria-haspopup="dialog"
        onClick={(event) => { event.stopPropagation(); onMenu(); }}
        className="mr-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground/60 outline-none hover:bg-muted hover:text-foreground"
      >
        <IconChevronDown aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}
