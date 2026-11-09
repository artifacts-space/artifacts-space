import { type CsvGrid, type GridCell, parseClipboardBlock, setCell } from "./csv-edit-rules";
import { parseCsv } from "./csv";
import { type GridBounds, type JumpDirection, type KeyIntent, keyIntent, moveCell } from "./grid-navigation";

/**
 * A selection in the sheet, as in a spreadsheet: the anchor where it
 * started and the active cell it was extended to. A single cell has both
 * the same. Row -1 is the header row.
 */
export interface GridSelection {
  anchor: GridCell;
  active: GridCell;
}

/** The block a selection covers, inclusive on every side. */
export interface CellRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** Whether two cells are the same place. */
export function sameCell(a: GridCell, b: GridCell): boolean {
  return a.row === b.row && a.column === b.column;
}

/** A selection of one cell. */
export function singleCell(cell: GridCell): GridSelection {
  return { anchor: cell, active: cell };
}

/** The selection grown or shrunk to `cell`, keeping its anchor, as Shift+click and Shift+arrows do. */
export function extendTo(selection: GridSelection, cell: GridCell): GridSelection {
  return { anchor: selection.anchor, active: cell };
}

/** Every cell, the header row included, as Cmd or Ctrl+A selects; the active cell goes to the top left. */
export function selectAll(bounds: GridBounds): GridSelection {
  const corner = { row: -1, column: 0 };
  return { anchor: { row: Math.max(-1, bounds.rows - 1), column: Math.max(0, bounds.columns - 1) }, active: corner };
}

/** The block between the anchor and the active cell. */
export function selectionRange(selection: GridSelection): CellRange {
  const { anchor, active } = selection;
  return {
    top: Math.min(anchor.row, active.row),
    bottom: Math.max(anchor.row, active.row),
    left: Math.min(anchor.column, active.column),
    right: Math.max(anchor.column, active.column),
  };
}

/** Whether a cell is in the block. */
export function inRange(range: CellRange, cell: GridCell): boolean {
  return cell.row >= range.top && cell.row <= range.bottom && cell.column >= range.left && cell.column <= range.right;
}

/** How many rows and columns the block spans. */
export function rangeSize(range: CellRange): { rows: number; columns: number } {
  return { rows: range.bottom - range.top + 1, columns: range.right - range.left + 1 };
}

/** True when the selection is one cell. */
export function isSingleCell(selection: GridSelection): boolean {
  return selection.anchor.row === selection.active.row && selection.anchor.column === selection.active.column;
}

/** A selection kept inside the sheet after rows or columns went away, such as after a filter or a deleted column. */
export function clampSelection(selection: GridSelection, bounds: GridBounds): GridSelection {
  const clamp = (cell: GridCell) => ({
    row: Math.min(Math.max(cell.row, -1), bounds.rows - 1),
    column: Math.min(Math.max(cell.column, 0), Math.max(0, bounds.columns - 1)),
  });
  return { anchor: clamp(selection.anchor), active: clamp(selection.active) };
}

const steps: Record<JumpDirection, GridCell> = { up: { row: -1, column: 0 }, down: { row: 1, column: 0 }, left: { row: 0, column: -1 }, right: { row: 0, column: 1 } };

function inBounds(cell: GridCell, bounds: GridBounds): boolean {
  return cell.row >= -1 && cell.row < bounds.rows && cell.column >= 0 && cell.column < bounds.columns;
}

const stepFrom = (cell: GridCell, step: GridCell) => ({ row: cell.row + step.row, column: cell.column + step.column });

/**
 * Where Cmd or Ctrl+arrow lands, as in a spreadsheet: from a filled cell
 * next to another filled cell, to the end of that run of filled cells;
 * otherwise to the next filled cell that way, or to the edge when there
 * is none. The header row counts as the top row.
 */
export function jumpCell(cell: GridCell, direction: JumpDirection, bounds: GridBounds, isBlank: (cell: GridCell) => boolean): GridCell {
  const step = steps[direction];
  let next = stepFrom(cell, step);
  if (!inBounds(next, bounds)) return cell;
  if (!isBlank(cell) && !isBlank(next)) {
    let current = next;
    next = stepFrom(current, step);
    while (inBounds(next, bounds) && !isBlank(next)) {
      current = next;
      next = stepFrom(current, step);
    }
    return current;
  }
  let current = next;
  while (isBlank(current)) {
    next = stepFrom(current, step);
    if (!inBounds(next, bounds)) return current;
    current = next;
  }
  return current;
}

const needsQuotes = /[\t\r\n"]/;

/** One value for TSV: quoted, with quotes doubled, when it holds a tab, a line break, or a quote, as Sheets and Excel copy it. */
function tsvValue(value: string): string {
  return needsQuotes.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * The block as tab-separated text, one line per row, for the clipboard.
 * `valueAt` gives a cell's text, with row -1 as the header.
 */
export function rangeToTsv(range: CellRange, valueAt: (cell: GridCell) => string): string {
  const lines: string[] = [];
  for (let row = range.top; row <= range.bottom; row += 1) {
    const values: string[] = [];
    for (let column = range.left; column <= range.right; column += 1) values.push(tsvValue(valueAt({ row, column })));
    lines.push(values.join("\t"));
  }
  return lines.join("\n");
}

/** CSV lines that agree on more than one column, so pasted text is clearly a table, not prose with commas. */
function csvBlock(text: string): string[][] | null {
  const parsed = parseCsv(text, { delimiter: ",", maxRows: Number.POSITIVE_INFINITY });
  if (parsed.errors.length > 0 || parsed.header.length < 2) return null;
  const width = parsed.header.length;
  if (parsed.rows.length === 0 || parsed.rows.some((row) => row.length !== width)) return null;
  return [[...parsed.header], ...parsed.rows.map((row) => [...row])];
}

/**
 * Cells from pasted text. Tab-separated text, as Sheets and Excel copy, is
 * read as a block. Several lines that read as CSV with the same number of
 * columns on every line are read as CSV. Anything else is one cell per
 * line, and a single line is one cell, kept exactly as copied.
 */
export function parsePasteBlock(text: string): string[][] {
  const trimmed = text.replace(/\r?\n$/, "");
  if (trimmed.includes("\t") || !/[\r\n]/.test(trimmed)) return parseClipboardBlock(text);
  return csvBlock(trimmed) ?? parseClipboardBlock(text);
}

/**
 * Where a paste goes and what it writes: the pasted block from the top
 * left of the selection, or, when one value is pasted over a larger
 * selection, that value in every selected data cell, as a spreadsheet
 * fills it. A single value never renames columns this way.
 */
export function pastePlan(range: CellRange, block: readonly (readonly string[])[]): { at: GridCell; block: readonly (readonly string[])[] } {
  const at = { row: range.top, column: range.left };
  const size = rangeSize(range);
  const single = block.length === 1 && block[0]?.length === 1;
  if (!single || (size.rows === 1 && size.columns === 1)) return { at, block };
  const value = block[0]?.[0] ?? "";
  const top = Math.max(0, range.top);
  const rows = range.bottom - top + 1;
  if (rows <= 0) return { at, block };
  return { at: { row: top, column: range.left }, block: Array.from({ length: rows }, () => Array.from({ length: size.columns }, () => value)) };
}

/** The grid with every cell in the block cleared. The header row is kept, so Delete never removes column names. */
export function clearRange(grid: CsvGrid, range: CellRange): CsvGrid {
  let next = grid;
  for (let row = Math.max(0, range.top); row <= range.bottom; row += 1) {
    for (let column = range.left; column <= range.right; column += 1) next = setCell(next, { row, column }, "");
  }
  return next;
}

/** A key press, as the grid sees it. */
export interface GridKeyPress {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/**
 * The selection after a key press, or null when the grid leaves the key to
 * the page: arrows, Home, End, Page Up or Down, Enter, and (when `tabMoves`)
 * Tab move the selection; with Shift they extend it; Cmd or Ctrl+arrow
 * jumps to the edge of the data; Cmd or Ctrl+A selects everything.
 */
export function selectionAfterKey(press: GridKeyPress, selection: GridSelection, bounds: GridBounds, isBlank: (cell: GridCell) => boolean, tabMoves: boolean): GridSelection | null {
  if (leftToPage(press, bounds, tabMoves)) return null;
  const ctrl = press.ctrlKey || press.metaKey;
  if (ctrl && press.key.toLowerCase() === "a") return selectAll(bounds);
  const intent = keyIntent(press.key, { shift: press.shiftKey, ctrl });
  if (intent === null) return null;
  const target = intentTarget(intent, selection.active, bounds, isBlank);
  if (target === null) return null;
  return intent.extend ? extendTo(selection, target) : singleCell(target);
}

/** Keys the grid never takes: anything with Alt, Tab when Tab leaves the grid, and every key in a sheet with no columns. */
function leftToPage(press: GridKeyPress, bounds: GridBounds, tabMoves: boolean): boolean {
  return press.altKey || (press.key === "Tab" && !tabMoves) || bounds.columns === 0;
}

function intentTarget(intent: KeyIntent, from: GridCell, bounds: GridBounds, isBlank: (cell: GridCell) => boolean): GridCell | null {
  if (intent.jump !== null) return jumpCell(from, intent.jump, bounds, isBlank);
  return intent.move === null ? null : moveCell(from, intent.move, bounds);
}
