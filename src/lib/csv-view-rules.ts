import { type ColumnType, parseDate, parseNumber } from "./csv-values";

export type SortDirection = "asc" | "desc";

export interface ColumnSort {
  column: number;
  direction: SortDirection;
}

/** One column's filter. Blank fields are off. `min` and `max` apply to number columns. */
export interface ColumnFilter {
  contains: string;
  min: string;
  max: string;
}

/** How a reader is looking at a CSV. It never changes the stored file. */
export interface CsvViewState {
  sort: ColumnSort | null;
  /** Text matched against every column. */
  quick: string;
  filters: Partial<Record<number, ColumnFilter>>;
}

export const emptyColumnFilter: ColumnFilter = { contains: "", min: "", max: "" };
export const initialViewState: CsvViewState = { sort: null, quick: "", filters: {} };

/** Header clicks cycle a column through ascending, descending, then no sort. */
export function nextSort(current: ColumnSort | null, column: number): ColumnSort | null {
  if (current?.column !== column) return { column, direction: "asc" };
  return current.direction === "asc" ? { column, direction: "desc" } : null;
}

/** The value `aria-sort` takes for a column header. */
export function ariaSort(sort: ColumnSort | null, column: number): "ascending" | "descending" | "none" {
  if (sort?.column !== column) return "none";
  return sort.direction === "asc" ? "ascending" : "descending";
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

type SortKey = number | string | null;

function sortKey(value: string, type: ColumnType): SortKey {
  if (value.trim() === "") return null;
  if (type === "number") return parseNumber(value);
  if (type === "date") return parseDate(value);
  return value;
}

function compareKeys(a: SortKey, b: SortKey): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

/**
 * Row indexes in sorted order. Numbers and dates sort by value, text in
 * natural order ("item 2" before "item 10"). Blank cells always sort last,
 * in either direction. Equal values keep their file order.
 */
export function sortRowIndexes(rows: readonly (readonly string[])[], indexes: readonly number[], sort: ColumnSort, type: ColumnType): number[] {
  const keyed = indexes.map((index) => ({ index, key: sortKey(rows[index]?.[sort.column] ?? "", type) }));
  const sign = sort.direction === "asc" ? 1 : -1;
  keyed.sort((a, b) => {
    if (a.key === null || b.key === null) return a.key === b.key ? a.index - b.index : a.key === null ? 1 : -1;
    return sign * compareKeys(a.key, b.key) || a.index - b.index;
  });
  return keyed.map((entry) => entry.index);
}

/** True when a filter has any field set. */
export function isFilterActive(filter: ColumnFilter | undefined): filter is ColumnFilter {
  return filter !== undefined && (filter.contains.trim() !== "" || filter.min.trim() !== "" || filter.max.trim() !== "");
}

function withinRange(value: string, filter: ColumnFilter): boolean {
  const min = parseNumber(filter.min);
  const max = parseNumber(filter.max);
  if (min === null && max === null) return true;
  const number = parseNumber(value);
  if (number === null) return false;
  return (min === null || number >= min) && (max === null || number <= max);
}

/**
 * Whether one cell passes its column's filter: "contains" ignores case; a
 * min or max keeps only numbers in range, so blank cells drop out.
 */
export function matchesColumnFilter(value: string, filter: ColumnFilter): boolean {
  const needle = filter.contains.trim().toLowerCase();
  if (needle !== "" && !value.toLowerCase().includes(needle)) return false;
  return withinRange(value, filter);
}

/** Whether any of the first `columnCount` cells holds `needle`, ignoring case. */
export function matchesQuickFilter(row: readonly string[], needle: string, columnCount: number): boolean {
  const lowered = needle.trim().toLowerCase();
  if (lowered === "") return true;
  for (let column = 0; column < columnCount; column += 1) {
    if ((row[column] ?? "").toLowerCase().includes(lowered)) return true;
  }
  return false;
}

function activeFilters(filters: CsvViewState["filters"], columnCount: number): [number, ColumnFilter][] {
  const active: [number, ColumnFilter][] = [];
  for (let column = 0; column < columnCount; column += 1) {
    const filter = filters[column];
    if (isFilterActive(filter)) active.push([column, filter]);
  }
  return active;
}

/**
 * The rows a reader sees, as indexes into `rows`: filtered by the quick
 * filter and every column filter, then sorted.
 */
export function viewRowIndexes(rows: readonly (readonly string[])[], types: readonly ColumnType[], view: CsvViewState): number[] {
  const columnCount = types.length;
  const filters = activeFilters(view.filters, columnCount);
  const kept: number[] = [];
  rows.forEach((row, index) => {
    if (!matchesQuickFilter(row, view.quick, columnCount)) return;
    if (filters.every(([column, filter]) => matchesColumnFilter(row[column] ?? "", filter))) kept.push(index);
  });
  const sort = view.sort;
  if (sort === null || sort.column >= columnCount) return kept;
  return sortRowIndexes(rows, kept, sort, types[sort.column] ?? "text");
}

/** Number of columns with an active filter. */
export function activeFilterCount(view: CsvViewState): number {
  return Object.values(view.filters).filter(isFilterActive).length;
}

/** Rows read to size columns. More would cost time and rarely change a width. */
const widthSampleRows = 200;

function firstLineLength(value: string): number {
  const end = value.search(/[\r\n]/);
  return end === -1 ? value.length : end;
}

/**
 * Each column's width in `ch`, from the header and the first rows: wide
 * enough for typical values, between 6 and 36. Fixed widths keep columns
 * steady while rows scroll in and out.
 */
export function columnWidths(header: readonly string[], rows: readonly (readonly string[])[], columnCount: number): number[] {
  const sample = rows.slice(0, widthSampleRows);
  return Array.from({ length: columnCount }, (_, column) => {
    // Room for the sort arrow and the menu button next to the name.
    let widest = firstLineLength(header[column] ?? "") + 5;
    for (const row of sample) widest = Math.max(widest, firstLineLength(row[column] ?? ""));
    return Math.min(36, Math.max(6, widest));
  });
}
