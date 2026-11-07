"use client";

import { useMemo, useRef, useState } from "react";

import { type CsvTextStyle, parseCsv, serializeCsv } from "@/lib/csv";
import type { CsvGrid } from "@/lib/csv-edit-rules";

/** Grid edits kept for undo. */
const historyLimit = 100;

interface History {
  past: string[];
  future: string[];
}

export interface CsvGridState {
  grid: CsvGrid;
  /**
   * Changes the grid and writes it back to the CSV text. `update` gets the
   * newest grid, including an edit applied a moment ago that has not
   * rendered yet, such as a cell saved on blur just before a button click.
   */
  apply: (update: (grid: CsvGrid) => CsvGrid) => void;
  /** Returns false when there is nothing to undo or redo. */
  undo: () => boolean;
  redo: () => boolean;
}

/**
 * The CSV text, seen as a grid. The text stays the source of truth: each
 * grid edit writes the whole file back with `serializeCsv`, in the file's
 * own separator and line breaks, so cells nobody touched keep their values
 * and the save path is the same as for raw text.
 */
export function useCsvGrid(value: string, onChange: (value: string) => void, style: CsvTextStyle): CsvGridState {
  const grid = useMemo<CsvGrid>(() => {
    const parsed = parseCsv(value, { delimiter: style.delimiter, maxRows: Number.POSITIVE_INFINITY });
    return { header: parsed.header, rows: parsed.rows };
  }, [value, style.delimiter]);
  const [history, setHistory] = useState<History>({ past: [], future: [] });

  const pending = useRef<{ against: string; text: string; grid: CsvGrid } | null>(null);

  function latest() {
    const last = pending.current;
    return last?.against === value ? last : { text: value, grid };
  }

  function apply(update: (grid: CsvGrid) => CsvGrid) {
    const base = latest();
    const next = update(base.grid);
    if (next === base.grid) return;
    const text = serializeCsv(next.header, next.rows, style);
    if (text === base.text) return;
    pending.current = { against: value, text, grid: next };
    setHistory((current) => ({ past: [...current.past.slice(1 - historyLimit), base.text], future: [] }));
    onChange(text);
  }

  function undo() {
    const previous = history.past.at(-1);
    if (previous === undefined) return false;
    setHistory({ past: history.past.slice(0, -1), future: [value, ...history.future] });
    onChange(previous);
    return true;
  }

  function redo() {
    const [next, ...rest] = history.future;
    if (next === undefined) return false;
    setHistory({ past: [...history.past, value], future: rest });
    onChange(next);
    return true;
  }

  return { grid, apply, undo, redo };
}
