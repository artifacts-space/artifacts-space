import { parseCsv } from "./csv";

/**
 * A CSV being edited: the header row and the data rows. Rows may be ragged;
 * a missing cell reads as blank, and only cells someone edits are filled in,
 * so untouched rows save exactly as they were.
 */
export interface CsvGrid {
  header: readonly string[];
  rows: readonly (readonly string[])[];
}

/** A cell position. Row -1 is the header row. */
export interface GridCell {
  row: number;
  column: number;
}

/** The widest record's length: the number of columns the grid shows. */
export function gridWidth(grid: CsvGrid): number {
  return grid.rows.reduce((widest, row) => Math.max(widest, row.length), grid.header.length);
}

/** The text in a cell, with row -1 as the header. Missing cells are blank. */
export function cellValue(grid: CsvGrid, cell: GridCell): string {
  const record = cell.row === -1 ? grid.header : grid.rows[cell.row];
  return record?.[cell.column] ?? "";
}

/** A copy of `record` with `value` at `column`, padding with blanks when the record is short. */
function withValue(record: readonly string[], column: number, value: string): string[] {
  const next = [...record];
  while (next.length < column) next.push("");
  next[column] = value;
  return next;
}

/** The default name for a new column, such as "Column 4". */
export function newColumnName(column: number): string {
  return `Column ${String(column + 1)}`;
}

/** Sets one cell. Row -1 renames the header and leaves the data under it as it is. */
export function setCell(grid: CsvGrid, cell: GridCell, value: string): CsvGrid {
  if (cellValue(grid, cell) === value) return grid;
  if (cell.row === -1) return renameColumn(grid, cell.column, value);
  const row = grid.rows[cell.row];
  if (row === undefined) return grid;
  const rows = [...grid.rows];
  rows[cell.row] = withValue(row, cell.column, value);
  return { header: grid.header, rows };
}

/** Renames a column. The data in it stays. */
export function renameColumn(grid: CsvGrid, column: number, name: string): CsvGrid {
  return { header: withValue(grid.header, column, name), rows: grid.rows };
}

/** Inserts a blank row so it becomes row `at`. */
export function insertRow(grid: CsvGrid, at: number): CsvGrid {
  const rows = [...grid.rows];
  rows.splice(Math.max(0, Math.min(at, rows.length)), 0, Array.from({ length: gridWidth(grid) }, () => ""));
  return { header: grid.header, rows };
}

/** Removes row `at`. */
export function deleteRow(grid: CsvGrid, at: number): CsvGrid {
  if (at < 0 || at >= grid.rows.length) return grid;
  return { header: grid.header, rows: grid.rows.filter((_, index) => index !== at) };
}

/** A copy of `record` padded with blanks to `length`, or the same record when it is long enough. */
function padTo(record: readonly string[], length: number): readonly string[] {
  if (record.length >= length) return record;
  return [...record, ...Array.from({ length: length - record.length }, () => "")];
}

/**
 * Inserts a named, blank column so it becomes column `at`. Every row gains a
 * blank cell for it, so the file stays rectangular where it was.
 */
export function insertColumn(grid: CsvGrid, at: number, name = newColumnName(at)): CsvGrid {
  const width = gridWidth(grid);
  const header = [...padTo(grid.header, at).map((value, index) => (index >= grid.header.length ? newColumnName(index) : value))];
  header.splice(at, 0, name);
  const rows = grid.rows.map((row) => {
    if (row.length > at) return [...row.slice(0, at), "", ...row.slice(at)];
    return row.length >= width ? padTo(row, at + 1) : row;
  });
  return { header, rows };
}

/** Removes column `at` from the header and every row. */
export function deleteColumn(grid: CsvGrid, at: number): CsvGrid {
  const without = (record: readonly string[]) => (record.length > at ? record.filter((_, index) => index !== at) : record);
  return { header: without(grid.header), rows: grid.rows.map(without) };
}

/**
 * Cells from the clipboard. Sheets and Excel copy a block as tab-separated
 * text, quoting cells that hold tabs or line breaks; that is read as a block.
 * Text with no tab or line break is one cell, kept exactly as copied.
 */
export function parseClipboardBlock(text: string): string[][] {
  const trimmed = text.replace(/\r?\n$/, "");
  if (!/[\t\r\n]/.test(trimmed)) return [[trimmed]];
  const parsed = parseCsv(trimmed, { delimiter: "\t", maxRows: Number.POSITIVE_INFINITY });
  return parsed.header.length === 0 ? [] : [parsed.header, ...parsed.rows];
}

/** The grid after a paste, and the block of cells the paste filled. */
export interface PasteResult {
  grid: CsvGrid;
  from: GridCell;
  to: GridCell;
}

function growToFit(grid: CsvGrid, lastRow: number, lastColumn: number): CsvGrid {
  const oldWidth = gridWidth(grid);
  const width = Math.max(oldWidth, lastColumn + 1);
  // Rows as wide as the grid grow with it; rows that were already short stay short.
  const rows = grid.rows.map((row) => (row.length >= oldWidth ? padTo(row, width) : row));
  while (rows.length <= lastRow) rows.push(Array.from({ length: width }, () => ""));
  const header = [...grid.header];
  while (header.length <= lastColumn) header.push(newColumnName(header.length));
  return { header, rows };
}

/**
 * Pastes a block with its top-left corner at `at`, like a spreadsheet: it
 * overwrites the cells it covers and adds rows and named columns when the
 * block runs past the edge. Pasting onto the header row renames columns
 * with the block's first line.
 */
export function pasteBlock(grid: CsvGrid, at: GridCell, block: readonly (readonly string[])[]): PasteResult {
  const height = block.length;
  const width = block.reduce((widest, line) => Math.max(widest, line.length), 0);
  const to = { row: at.row + height - 1, column: at.column + width - 1 };
  if (height === 0 || width === 0) return { grid, from: at, to: at };
  const grown = growToFit(grid, to.row, to.column);
  let header = grown.header;
  const rows = [...grown.rows];
  const write = (record: readonly string[], line: readonly string[]) => line.reduce((current, value, offset) => withValue(current, at.column + offset, value), record);
  block.forEach((line, offset) => {
    const target = at.row + offset;
    if (target === -1) header = write(header, line);
    else rows[target] = write(rows[target] ?? [], line);
  });
  const next: CsvGrid = { header, rows };
  return { grid: next, from: at, to };
}
