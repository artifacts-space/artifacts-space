import { z } from "zod";

import type { CsvGrid } from "./csv-edit-rules";
import { clampColumnWidth } from "./sheet-grid-rules";

/** A copy of `list` with the item at `from` moved so it ends up at `to`. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next;
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

/**
 * A record with one column moved. A short (ragged) record that ends before
 * both places is left alone; otherwise it is padded with blanks to make the
 * move, then trailing blanks it did not have are dropped again, so rows
 * nobody touched keep their shape.
 */
function moveInRecord(record: readonly string[], from: number, to: number): readonly string[] {
  if (record.length <= Math.min(from, to)) return record;
  const padded = [...record];
  while (padded.length <= Math.max(from, to)) padded.push("");
  const moved = moveItem(padded, from, to);
  while (moved.length > record.length && moved.at(-1) === "") moved.pop();
  return moved;
}

/**
 * The grid with column `from` moved to `to`, header and every row, as a
 * spreadsheet does when a column is dragged. The CSV saves in the new order.
 */
export function moveColumn(grid: CsvGrid, from: number, to: number): CsvGrid {
  if (from === to) return grid;
  return { header: moveInRecord(grid.header, from, to), rows: grid.rows.map((row) => moveInRecord(row, from, to)) };
}

/** The identity order: column 0, 1, 2, and so on. */
export function naturalOrder(count: number): number[] {
  return Array.from({ length: count }, (_, column) => column);
}

/**
 * A reader's saved column order made safe for the file as it is now: it
 * keeps the saved columns that still exist, once each, then adds any new
 * ones at the end.
 */
export function normalizeOrder(saved: readonly number[] | undefined, count: number): number[] {
  const seen = new Set<number>();
  const order: number[] = [];
  for (const column of saved ?? []) {
    if (Number.isInteger(column) && column >= 0 && column < count && !seen.has(column)) {
      seen.add(column);
      order.push(column);
    }
  }
  for (let column = 0; column < count; column += 1) if (!seen.has(column)) order.push(column);
  return order;
}

/** True when the order is the file's own. */
export function isNaturalOrder(order: readonly number[]): boolean {
  return order.every((column, index) => column === index);
}

/**
 * Where a dragged column lands: the shown position whose slot is nearest
 * the pointer. `x` is measured from the left of the first data column;
 * the result is the index the column should move to.
 */
export function dropTarget(offsets: readonly number[], from: number, x: number): number {
  const count = offsets.length - 1;
  let slot = count;
  for (let column = 0; column < count; column += 1) {
    const middle = ((offsets[column] ?? 0) + (offsets[column + 1] ?? 0)) / 2;
    if (x < middle) {
      slot = column;
      break;
    }
  }
  return slot > from ? slot - 1 : slot;
}

/** Where the drop line is drawn, from the left of the first data column, for a move from `from` to `to`. */
export function dropLineX(offsets: readonly number[], from: number, to: number): number {
  const slot = to > from ? to + 1 : to;
  return offsets[slot] ?? 0;
}

/** Room around the widest text when a column fits its content: the cell padding and a little air. */
const fitPadding = 28;

/** The width that fits the widest of the measured texts, inside the narrowest and widest a column can be. */
export function fitWidth(textWidths: readonly number[]): number {
  let widest = 0;
  for (const width of textWidths) widest = Math.max(widest, width);
  return clampColumnWidth(Math.ceil(widest) + fitPadding);
}

/** A width while dragging a header edge: the start width plus the pointer's travel, kept in range. */
export function resizedWidth(startWidth: number, startX: number, x: number): number {
  return clampColumnWidth(startWidth + x - startX);
}

/** Longest column name used whole in a key; a longer one is cut and gets a hash of the whole name. */
const keyNameChars = 120;

/** A short, stable FNV-1a hash of a name, as 8 hex digits. */
function nameHash(name: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** The quoted name in a key, cut with a hash when long, so every key stays short enough to store. */
function keyName(name: string): string {
  if (name.length <= keyNameChars) return JSON.stringify(name);
  return `${JSON.stringify(name.slice(0, keyNameChars))}~${nameHash(name)}`;
}

/**
 * A key per column that survives columns being added, removed, or moved:
 * its name, with a count for repeated names, or its position when it has no
 * name. Widths are stored under these keys. A very long name is cut and
 * hashed, so every key fits the stored limit.
 */
export function columnKeys(header: readonly string[], count: number): string[] {
  const seen = new Map<string, number>();
  return Array.from({ length: count }, (_, column) => {
    const name = (header[column] ?? "").trim();
    if (name === "") return `#${String(column)}`;
    const times = (seen.get(name) ?? 0) + 1;
    seen.set(name, times);
    // The name is quoted, so a column literally named "a#2" never shares a key with the second "a".
    const quoted = keyName(name);
    return times === 1 ? `=${quoted}` : `=${quoted}#${String(times)}`;
  });
}

/** How many columns a stored view keeps, so storage stays small. */
const storedColumnLimit = 500;

/** The longest column key a width is kept for. A longer column name keeps its default width. */
const maxStoredKeyChars = 200;

/** Whether a column's width can be kept: its key (a quoted column name) is short enough to store. */
export function canStoreWidth(key: string): boolean {
  return key.length <= maxStoredKeyChars;
}

/** Stored widths with any over-long keys left out, so one bad key never throws the others away. */
function storableWidths(widths: unknown): unknown {
  if (typeof widths !== "object" || widths === null || Array.isArray(widths)) return widths;
  return Object.fromEntries(Object.entries(widths).filter(([key]) => canStoreWidth(key)));
}

const prefsSchema = z.object({
  widths: z.preprocess(storableWidths, z.record(z.string().max(maxStoredKeyChars), z.number().int().min(1).max(10_000)).optional()),
  order: z.array(z.number().int().min(0).max(100_000)).max(storedColumnLimit).optional(),
});

/** What one viewer keeps for one sheet: column widths by column key, and, for readers, their own column order. */
export interface SheetPrefs {
  widths: Record<string, number>;
  order: number[] | null;
}

export const emptySheetPrefs: SheetPrefs = { widths: {}, order: null };

/** Reads stored prefs, or empty prefs when the text is missing, broken, or the wrong shape. */
export function parseSheetPrefs(text: string | null): SheetPrefs {
  if (text === null) return emptySheetPrefs;
  try {
    const parsed = prefsSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return emptySheetPrefs;
    const widths = Object.fromEntries(Object.entries(parsed.data.widths ?? {}).slice(0, storedColumnLimit));
    return { widths, order: parsed.data.order ?? null };
  } catch {
    return emptySheetPrefs;
  }
}

/** The text stored for these prefs, keeping at most the column limit of widths. */
export function serializeSheetPrefs(prefs: SheetPrefs): string {
  const widths = Object.fromEntries(Object.entries(prefs.widths).filter(([key]) => canStoreWidth(key)).slice(0, storedColumnLimit));
  return JSON.stringify(prefs.order === null ? { widths } : { widths, order: prefs.order.slice(0, storedColumnLimit) });
}

/** The storage key for one sheet's prefs. Kept per artifact, never saved to the artifact itself. */
export function sheetPrefsKey(artifactKey: string): string {
  return `sheet-view:v1:${artifactKey}`;
}

/** Each column's width: the viewer's own when they set one, else the default. */
export function appliedWidths(defaults: readonly number[], keys: readonly string[], stored: Readonly<Record<string, number>>): number[] {
  return defaults.map((width, column) => {
    const own = stored[keys[column] ?? ""];
    return own === undefined ? width : clampColumnWidth(own);
  });
}
