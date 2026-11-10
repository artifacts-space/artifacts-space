"use client";

import { useCallback, useMemo } from "react";

import { appliedWidths, columnKeys, isNaturalOrder, moveItem, naturalOrder, normalizeOrder } from "@/lib/sheet-column-rules";
import { alignmentChoice, canAlignColumn, cellAlignment, type SheetAlignment, type SheetBanding, withAlignment, withBanding } from "@/lib/sheet-format/rules";

import { measureFitWidth } from "./measure-text";
import { type ColumnAlignControl, type SheetBandingControl, useSheetFormat } from "./sheet-format";
import { useSheetPrefs } from "./use-sheet-prefs";

interface SheetColumnsInput {
  header: readonly string[];
  rows: readonly (readonly string[])[];
  columnCount: number;
  /** Default widths in pixels, by column in the file. */
  defaults: readonly number[];
  numeric: readonly boolean[];
  /** True for readers: a moved column changes only their own view. Editors move columns in the file instead. */
  localOrder: boolean;
}

/** The sheet's columns as this viewer sees them. Column numbers here are shown positions; `dataColumn` maps one to the file's. */
export interface SheetColumns {
  dataColumn: (shown: number) => number;
  widths: number[];
  numeric: boolean[];
  /** How each shown column's cells line up: its saved alignment, or numbers right and text left. */
  align: SheetAlignment[];
  /** The sheet's saved banding, or null. */
  banding: SheetBanding | null;
  /** A shown column's alignment control for its menu; null for readers, who only see the alignment. */
  alignControl: (shown: number) => ColumnAlignControl | null;
  /** The sheet's banding control for the toolbar menu; null for readers. */
  bandingControl: SheetBandingControl | null;
  /** True when this reader moved columns, so they see an order nobody else does. */
  customOrder: boolean;
  resize: (shown: number, width: number) => void;
  /** Fits a column to its content; `grid` is the grid element, whose fonts are measured. */
  fit: (shown: number, grid: Element | null) => void;
  /** Moves a column in this reader's own view. */
  moveLocal: (from: number, to: number) => void;
  resetOrder: () => void;
}

/**
 * Column widths and order for one viewer. Widths are each viewer's own,
 * kept per artifact in this browser (use-sheet-prefs.ts) under keys that
 * follow a column when columns are added, removed, or moved. A reader can
 * also reorder columns for themselves; an editor's moves change the file,
 * so an editor always sees the file's order. Alignment and banding come
 * from the sheet's saved formatting (sheet-format.tsx), the same for everyone.
 */
export function useSheetColumns({ header, rows, columnCount, defaults, numeric, localOrder }: SheetColumnsInput): SheetColumns {
  const [prefs, setPrefs] = useSheetPrefs();
  const order = useMemo(() => (localOrder ? normalizeOrder(prefs.order ?? undefined, columnCount) : naturalOrder(columnCount)), [localOrder, prefs.order, columnCount]);
  const keys = useMemo(() => columnKeys(header, columnCount), [header, columnCount]);
  const applied = useMemo(() => appliedWidths(defaults, keys, prefs.widths), [defaults, keys, prefs.widths]);
  const widths = useMemo(() => order.map((column) => applied[column] ?? 120), [order, applied]);
  const shownNumeric = useMemo(() => order.map((column) => numeric[column] ?? false), [order, numeric]);
  const dataColumn = useCallback((shown: number) => order[shown] ?? shown, [order]);
  const { format, onChange } = useSheetFormat();
  const align = useMemo(() => order.map((column) => cellAlignment(format, keys[column] ?? "", numeric[column] ?? false)), [order, format, keys, numeric]);

  const alignControl = useCallback((shown: number): ColumnAlignControl | null => {
    const key = keys[dataColumn(shown)];
    if (!onChange || key === undefined || !canAlignColumn(key)) return null;
    return { value: alignmentChoice(format, key), onChange: (choice) => { onChange(withAlignment(format, key, choice, keys)); } };
  }, [keys, dataColumn, format, onChange]);

  const bandingControl = useMemo((): SheetBandingControl | null => {
    if (!onChange) return null;
    return { value: format.banding, onChange: (banding) => { onChange(withBanding(format, banding, keys)); } };
  }, [keys, format, onChange]);

  const resize = useCallback((shown: number, width: number) => {
    const key = keys[dataColumn(shown)];
    if (key === undefined) return;
    setPrefs((current) => ({ ...current, widths: { ...current.widths, [key]: width } }));
  }, [keys, dataColumn, setPrefs]);

  const fit = useCallback((shown: number, grid: Element | null) => {
    const column = dataColumn(shown);
    if (!grid) return;
    const width = measureFitWidth(grid, header[column] ?? "", rows.map((row) => row[column] ?? ""));
    if (width !== null) resize(shown, width);
  }, [dataColumn, header, rows, resize]);

  const moveLocal = useCallback((from: number, to: number) => {
    setPrefs((current) => {
      const next = moveItem(normalizeOrder(current.order ?? undefined, columnCount), from, to);
      return { ...current, order: isNaturalOrder(next) ? null : next };
    });
  }, [columnCount, setPrefs]);

  const resetOrder = useCallback(() => { setPrefs((current) => ({ ...current, order: null })); }, [setPrefs]);

  return { dataColumn, widths, numeric: shownNumeric, align, banding: format.banding, alignControl, bandingControl, customOrder: !isNaturalOrder(order), resize, fit, moveLocal, resetOrder };
}
