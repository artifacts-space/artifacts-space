"use client";

import { IconArrowBackUp, IconChevronDown, IconColumnInsertRight, IconColumnRemove, IconRowInsertBottom, IconRowRemove } from "@tabler/icons-react";
import { type ClipboardEvent, type KeyboardEvent, type ReactNode, useCallback, useId, useMemo, useRef, useState } from "react";

import { DataGrid, gridCellId } from "@/components/artifact-view/data-grid";
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
  parseClipboardBlock,
  pasteBlock,
  setCell,
} from "@/lib/csv-edit-rules";
import { detectColumnTypes } from "@/lib/csv-values";
import { columnWidths } from "@/lib/csv-view-rules";
import { clampCell, moveCell } from "@/lib/grid-navigation";

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
  const [rawActive, setActive] = useState<GridCell>({ row: 0, column: 0 });
  const active = clampCell(rawActive, { rows: grid.rows.length, columns: width });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [menuColumn, setMenuColumn] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const gridId = useId();
  const hintId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLElement | null>(null);
  const tabLeavesRef = useRef(false);
  const widths = useMemo(() => columnWidths(grid.header, grid.rows, width), [grid, width]);
  const cellText = useCallback((row: number, column: number) => grid.rows[row]?.[column] ?? "", [grid.rows]);
  const numeric = useMemo(() => detectColumnTypes(grid.rows, width).map((type) => type === "number"), [grid.rows, width]);

  const focusGrid = () => { wrapperRef.current?.querySelector("table")?.focus({ preventScroll: true }); };
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
    tableRef.current = wrapperRef.current?.querySelector("table") ?? null;
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

  function handleGridKey(event: KeyboardEvent<HTMLTableElement>): boolean {
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
    else if (action === "clear") apply((current) => setCell(current, active, ""));
    else if (action === "type") startEdit(active, event.key);
    return true;
  }

  function handlePaste(event: ClipboardEvent<HTMLTableElement>) {
    const text = event.clipboardData.getData("text/plain");
    if (editing || text === "") return;
    event.preventDefault();
    const block = parseClipboardBlock(text);
    const rows = block.length;
    const columns = block.reduce((widest, line) => Math.max(widest, line.length), 0);
    apply((current) => pasteBlock(current, active, block).grid);
    setStatus(`Pasted ${cellsLabel(rows, columns)}.`);
  }

  function handleCopy(event: ClipboardEvent<HTMLTableElement>) {
    event.clipboardData.setData("text/plain", cellValue(grid, active));
    event.preventDefault();
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
        <p role="status" className="ml-auto text-sm text-muted-foreground">{status}</p>
      </div>
      <DataGrid
        gridId={gridId}
        label="CSV grid editor"
        describedBy={hintId}
        columnCount={width}
        rowCount={grid.rows.length}
        widths={widths}
        numeric={numeric}
        header={(column) => <EditorHeader name={columnName(column)} onMenu={() => { openMenu(column); }} />}
        cell={cellText}
        rowLabel={rowNumber}
        active={editing ? editing.cell : active}
        onActiveChange={(cell) => { setStatus(""); setActive(cell); }}
        onActiveClick={(cell) => { if (!editing) startEdit(cell); }}
        onGridKeyDown={handleGridKey}
        activeContent={editor}
        onPaste={handlePaste}
        onCopy={handleCopy}
        tabMoves
        empty={width === 0 ? "This CSV is empty. Add a column to start." : "No rows yet. Add a row to start."}
      />
      <p id={hintId} className="text-xs text-muted-foreground">
        Double-click a cell, press Enter, or start typing to edit. Paste from Sheets or Excel to fill many cells. To leave the grid, press Escape, then Tab.
      </p>
      {menuColumn !== null ? (
        <CsvEditMenu
          onClose={() => { setMenuColumn(null); }}
          anchor={() => document.getElementById(gridCellId(gridId, { row: -1, column: menuColumn }))}
          returnFocus={tableRef}
          name={columnName(menuColumn)}
          onAction={(action) => { runColumnAction(action, menuColumn); }}
        />
      ) : null}
    </div>
  );
}

function EditorHeader({ name, onMenu }: { name: string; onMenu: () => void }) {
  return (
    <div className="group/header flex h-9 items-center">
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
