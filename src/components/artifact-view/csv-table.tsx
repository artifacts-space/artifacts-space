"use client";

import { IconArrowDown, IconArrowUp, IconChevronDown, IconFilter, IconSearch, IconX } from "@tabler/icons-react";
import { type ClipboardEvent, type KeyboardEvent, useCallback, useDeferredValue, useId, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseCsv } from "@/lib/csv";
import type { GridCell } from "@/lib/csv-edit-rules";
import { csvColumnCap, csvRowCap } from "@/lib/csv-limits";
import { detectColumnTypes } from "@/lib/csv-values";
import {
  ariaSort,
  type ColumnFilter,
  columnWidths,
  type CsvViewState,
  emptyColumnFilter,
  initialViewState,
  isFilterActive,
  nextSort,
  type SortDirection,
  viewRowIndexes,
} from "@/lib/csv-view-rules";
import { clampCell } from "@/lib/grid-navigation";

import { CsvColumnMenu } from "./csv-column-menu";
import { DataGrid, gridCellId } from "./data-grid";
import { ViewNotice } from "./view-notice";

const count = (value: number) => value.toLocaleString("en-US");

function useParsedCsv(content: string) {
  return useMemo(() => {
    const parsed = parseCsv(content, { maxRows: csvRowCap });
    const columns = Math.min(Math.max(parsed.columnCount, parsed.header.length), csvColumnCap);
    const types = detectColumnTypes(parsed.rows, columns);
    return { parsed, columns, types, widths: columnWidths(parsed.header, parsed.rows, columns), numeric: types.map((type) => type === "number") };
  }, [content]);
}

function csvNotes(parsed: ReturnType<typeof parseCsv>): string[] {
  return [
    parsed.truncated ? `Showing the first ${count(csvRowCap)} of ${count(parsed.totalRows)} rows.` : null,
    parsed.columnCount > csvColumnCap ? `Showing the first ${String(csvColumnCap)} of ${String(parsed.columnCount)} columns.` : null,
    ...parsed.errors,
  ].filter((note): note is string => note !== null);
}

/**
 * The interactive CSV table: click a header to sort, filter every column
 * from the search box or one column from its menu, and see how many rows
 * match. Sorting and filtering only change this view, never the file.
 */
export function CsvTable({ content }: { content: string }) {
  const { parsed, columns, types, widths, numeric } = useParsedCsv(content);
  const [view, setView] = useState<CsvViewState>(initialViewState);
  const quick = useDeferredValue(view.quick);
  const [rawActive, setActive] = useState<GridCell>({ row: 0, column: 0 });
  const [menuColumn, setMenuColumn] = useState<number | null>(null);
  const gridId = useId();
  const hintId = useId();
  const searchId = useId();
  const gridRef = useRef<HTMLElement | null>(null);
  const { sort, filters } = view;
  const shown = useMemo(() => viewRowIndexes(parsed.rows, types, { sort, filters, quick }), [parsed.rows, types, sort, filters, quick]);
  const cellText = useCallback((row: number, column: number) => parsed.rows[shown[row] ?? -1]?.[column] ?? "", [parsed.rows, shown]);
  const rowLabel = useCallback((row: number) => String((shown[row] ?? 0) + 1), [shown]);
  const active = clampCell(rawActive, { rows: shown.length, columns });

  if (parsed.header.length === 0) return <ViewNotice title="This CSV has no rows yet." />;
  const notes = csvNotes(parsed);
  const name = (column: number) => parsed.header[column] ?? "";
  const setFilter = (column: number, filter: ColumnFilter) => { setView((current) => ({ ...current, filters: { ...current.filters, [column]: filter } })); };
  const toggleSort = (column: number) => { setView((current) => ({ ...current, sort: nextSort(current.sort, column) })); };

  function openMenu(column: number) {
    gridRef.current = document.getElementById(gridCellId(gridId, { row: -1, column }))?.closest("table") ?? null;
    setActive({ row: -1, column });
    setMenuColumn(column);
  }

  function handleGridKey(event: KeyboardEvent<HTMLTableElement>): boolean {
    if ((event.altKey && event.key === "ArrowDown") || event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      openMenu(active.column);
      return true;
    }
    if (active.row !== -1 || (event.key !== "Enter" && event.key !== " ")) return false;
    event.preventDefault();
    toggleSort(active.column);
    return true;
  }

  function copyCell(event: ClipboardEvent<HTMLTableElement>) {
    const row = active.row === -1 ? parsed.header : parsed.rows[shown[active.row] ?? -1];
    event.clipboardData.setData("text/plain", row?.[active.column] ?? "");
    event.preventDefault();
  }

  const menuSort: SortDirection | null = menuColumn !== null && view.sort?.column === menuColumn ? view.sort.direction : null;

  return (
    <div className="min-w-0 space-y-3">
      <CsvToolbar
        searchId={searchId}
        view={view}
        onViewChange={setView}
        name={name}
        shown={shown.length}
        total={parsed.rows.length}
      />
      <p id={hintId} className="sr-only">Use the arrow keys to move between cells. On a column header, press Enter to sort, or Alt and Down Arrow for filters.</p>
      <DataGrid
        gridId={gridId}
        label="CSV table"
        describedBy={hintId}
        columnCount={columns}
        rowCount={shown.length}
        widths={widths}
        numeric={numeric}
        header={(column) => (
          <ColumnHeader
            name={name(column)}
            sort={view.sort?.column === column ? view.sort.direction : null}
            filtered={isFilterActive(view.filters[column])}
            onSort={() => { toggleSort(column); }}
            onMenu={() => { openMenu(column); }}
          />
        )}
        headerSort={(column) => ariaSort(view.sort, column)}
        cell={cellText}
        rowLabel={rowLabel}
        active={active}
        onActiveChange={setActive}
        onGridKeyDown={handleGridKey}
        onCopy={copyCell}
        empty={parsed.rows.length === 0 ? "Only a header row so far." : "No rows match these filters."}
      />
      {menuColumn !== null ? (
        <CsvColumnMenu
          open
          onOpenChange={(open) => { if (!open) setMenuColumn(null); }}
          anchor={() => document.getElementById(gridCellId(gridId, { row: -1, column: menuColumn }))}
          returnFocus={gridRef}
          name={name(menuColumn)}
          type={types[menuColumn] ?? "text"}
          sort={menuSort}
          onSort={(direction) => { setView((current) => ({ ...current, sort: direction === null ? null : { column: menuColumn, direction } })); }}
          filter={view.filters[menuColumn] ?? emptyColumnFilter}
          onFilterChange={(filter) => { setFilter(menuColumn, filter); }}
        />
      ) : null}
      {notes.length > 0 ? <p className="text-sm text-muted-foreground">{notes.join(" ")}</p> : null}
    </div>
  );
}

interface ColumnHeaderProps {
  name: string;
  sort: SortDirection | null;
  filtered: boolean;
  onSort: () => void;
  onMenu: () => void;
}

/** A header cell's sort button and menu button. Both stay out of the Tab order; the grid's keys reach them. */
function ColumnHeader({ name, sort, filtered, onSort, onMenu }: ColumnHeaderProps) {
  const SortIcon = sort === "desc" ? IconArrowDown : IconArrowUp;
  return (
    <div className="group/header flex h-9 items-center">
      <button type="button" tabIndex={-1} onClick={onSort} className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1 pr-1 pl-3 text-left outline-none hover:text-foreground">
        <span className="truncate">{name}</span>
        {sort ? <SortIcon aria-hidden className="size-3.5 shrink-0 text-foreground" /> : null}
        {filtered ? <IconFilter aria-label="Filtered" className="size-3.5 shrink-0 text-foreground" /> : null}
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Sort and filter ${name || "this column"}`}
        aria-haspopup="dialog"
        onClick={onMenu}
        className="mr-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground/60 outline-none hover:bg-muted hover:text-foreground pointer-fine:opacity-0 pointer-fine:group-hover/header:opacity-100 pointer-fine:group-focus-within/grid:opacity-100"
      >
        <IconChevronDown aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}

interface ToolbarProps {
  searchId: string;
  view: CsvViewState;
  onViewChange: (update: (current: CsvViewState) => CsvViewState) => void;
  name: (column: number) => string;
  shown: number;
  total: number;
}

function filterLabel(name: string, filter: ColumnFilter): string {
  const parts = [
    filter.contains.trim() ? `contains “${filter.contains.trim()}”` : null,
    filter.min.trim() ? `≥ ${filter.min.trim()}` : null,
    filter.max.trim() ? `≤ ${filter.max.trim()}` : null,
  ].filter((part): part is string => part !== null);
  return `${name || "Column"} ${parts.join(", ")}`;
}

/** The search box, active column filters as removable chips, and the row count. */
function CsvToolbar({ searchId, view, onViewChange, name, shown, total }: ToolbarProps) {
  const filters = Object.entries(view.filters).flatMap(([column, filter]) => (isFilterActive(filter) ? [{ column: Number(column), filter }] : []));
  const filtering = view.quick.trim() !== "" || filters.length > 0;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <IconSearch aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Label htmlFor={searchId} className="sr-only">Filter rows in every column</Label>
        <Input
          id={searchId}
          type="search"
          value={view.quick}
          placeholder="Filter rows"
          autoComplete="off"
          onChange={(event) => { const quick = event.target.value; onViewChange((current) => ({ ...current, quick })); }}
          className="pl-8 [&::-webkit-search-cancel-button]:appearance-none"
        />
      </div>
      {filters.map(({ column, filter }) => (
        <Button
          key={column}
          variant="outline"
          size="sm"
          className="max-w-full font-normal"
          aria-label={`Remove filter: ${filterLabel(name(column), filter)}`}
          onClick={() => { onViewChange((current) => ({ ...current, filters: { ...current.filters, [column]: emptyColumnFilter } })); }}
        >
          <span className="truncate">{filterLabel(name(column), filter)}</span>
          <IconX aria-hidden />
        </Button>
      ))}
      {filtering ? (
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { onViewChange((current) => ({ ...current, quick: "", filters: {} })); }}>
          Clear filters
        </Button>
      ) : null}
      <p role="status" className="ml-auto text-sm text-muted-foreground tabular-nums">
        Showing {count(shown)} of {count(total)} {total === 1 ? "row" : "rows"}
      </p>
    </div>
  );
}

