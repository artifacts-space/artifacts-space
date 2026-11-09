import { describe, expect, it } from "vitest";

import type { GridCell } from "./csv-edit-rules";
import {
  clampSelection,
  clearRange,
  pasteFits,
  sameCell,
  extendTo,
  inRange,
  isSingleCell,
  jumpCell,
  parsePasteBlock,
  pastePlan,
  rangeSize,
  rangeToTsv,
  selectAll,
  selectionAfterKey,
  selectionRange,
  singleCell,
} from "./grid-selection-rules";

describe("selection and range math", () => {
  it("should cover the block between anchor and active whichever way it was dragged", () => {
    const up = extendTo(singleCell({ row: 5, column: 3 }), { row: 2, column: 1 });
    expect(selectionRange(up)).toEqual({ top: 2, left: 1, bottom: 5, right: 3 });
    expect(rangeSize(selectionRange(up))).toEqual({ rows: 4, columns: 3 });
    expect(isSingleCell(up)).toBe(false);
    expect(isSingleCell(singleCell({ row: 0, column: 0 }))).toBe(true);
  });

  it("should say which cells are in the block", () => {
    const range = { top: 1, left: 1, bottom: 2, right: 2 };
    expect(inRange(range, { row: 2, column: 1 })).toBe(true);
    expect(inRange(range, { row: 3, column: 1 })).toBe(false);
    expect(inRange(range, { row: 1, column: 0 })).toBe(false);
  });

  it("should select every cell and the header when everything is selected", () => {
    const all = selectAll({ rows: 10, columns: 4 });
    expect(selectionRange(all)).toEqual({ top: -1, left: 0, bottom: 9, right: 3 });
    expect(all.active).toEqual({ row: -1, column: 0 });
  });

  it("should pull a selection back inside the sheet when rows or columns went away", () => {
    const wide = extendTo(singleCell({ row: 1, column: 1 }), { row: 30, column: 9 });
    expect(clampSelection(wide, { rows: 5, columns: 3 })).toEqual({ anchor: { row: 1, column: 1 }, active: { row: 4, column: 2 } });
  });
});

describe("jumpCell", () => {
  // Row -1 is the header. Column 0: a, 1, 2, blank, blank, 5, 6.
  const column = ["a", "1", "2", "", "", "5", "6"];
  const isBlank = (cell: GridCell) => (column[cell.row + 1] ?? "") === "";
  const bounds = { rows: 6, columns: 1 };

  it("should run to the end of a filled run when the next cell is filled", () => {
    expect(jumpCell({ row: -1, column: 0 }, "down", bounds, isBlank)).toEqual({ row: 1, column: 0 });
  });

  it("should jump over blanks to the next filled cell when at the end of a run", () => {
    expect(jumpCell({ row: 1, column: 0 }, "down", bounds, isBlank)).toEqual({ row: 4, column: 0 });
    expect(jumpCell({ row: 4, column: 0 }, "up", bounds, isBlank)).toEqual({ row: 1, column: 0 });
  });

  it("should stop at the edge when nothing filled lies that way", () => {
    expect(jumpCell({ row: 5, column: 0 }, "down", bounds, isBlank)).toEqual({ row: 5, column: 0 });
    const blanks = () => true;
    expect(jumpCell({ row: 0, column: 0 }, "right", { rows: 1, columns: 8 }, blanks)).toEqual({ row: 0, column: 7 });
    expect(jumpCell({ row: 0, column: 7 }, "left", { rows: 1, columns: 8 }, blanks)).toEqual({ row: 0, column: 0 });
  });
});

describe("rangeToTsv", () => {
  const cells: Record<string, string> = { "-1:0": "name", "-1:1": "note", "0:0": "Ada", "0:1": "says \"hi\"", "1:0": "Lin", "1:1": "two\nlines" };
  const valueAt = (cell: GridCell) => cells[`${String(cell.row)}:${String(cell.column)}`] ?? "";

  it("should copy a block as tab-separated lines with the header when it is selected", () => {
    expect(rangeToTsv({ top: -1, left: 0, bottom: 0, right: 0 }, valueAt)).toBe("name\nAda");
  });

  it("should quote values with quotes, tabs, or line breaks when copying, as Sheets does", () => {
    expect(rangeToTsv({ top: 0, left: 0, bottom: 1, right: 1 }, valueAt)).toBe('Ada\t"says ""hi"""\nLin\t"two\nlines"');
  });

  it("should read back as the same block when pasted", () => {
    const tsv = rangeToTsv({ top: -1, left: 0, bottom: 1, right: 1 }, valueAt);
    expect(parsePasteBlock(tsv)).toEqual([["name", "note"], ["Ada", 'says "hi"'], ["Lin", "two\nlines"]]);
  });
});

describe("parsePasteBlock", () => {
  it("should paste a copied cell holding a quote as the original text", () => {
    const copied = rangeToTsv({ top: 0, left: 0, bottom: 0, right: 0 }, () => '6" pipe');
    expect(parsePasteBlock(copied)).toEqual([['6" pipe']]);
    expect(parsePasteBlock('"a\tb"')).toEqual([["a\tb"]]);
  });

  it("should read tab-separated text as a block when pasted from a spreadsheet", () => {
    expect(parsePasteBlock("a\tb\n1\t2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("should read CSV lines as a block when every line has the same number of columns", () => {
    expect(parsePasteBlock('a,b\n1,"x, y"\n')).toEqual([["a", "b"], ["1", "x, y"]]);
  });

  it("should keep one cell per line when lines do not agree as CSV", () => {
    expect(parsePasteBlock("Hello, world\nSecond line")).toEqual([["Hello, world"], ["Second line"]]);
  });

  it("should keep a single line as one cell, commas and all", () => {
    expect(parsePasteBlock("Paris, France")).toEqual([["Paris, France"]]);
  });
});

describe("pastePlan", () => {
  it("should write nothing when one value is pasted over several column names", () => {
    expect(pastePlan({ top: -1, left: 0, bottom: -1, right: 2 }, [["x"]]).block).toEqual([]);
  });

  it("should paste a block from the top left of the selection", () => {
    const block = [["1", "2"], ["3", "4"]];
    expect(pastePlan({ top: 2, left: 1, bottom: 6, right: 4 }, block)).toEqual({ at: { row: 2, column: 1 }, block });
  });

  it("should fill every selected data cell when one value is pasted over a larger selection", () => {
    expect(pastePlan({ top: -1, left: 0, bottom: 1, right: 1 }, [["x"]])).toEqual({ at: { row: 0, column: 0 }, block: [["x", "x"], ["x", "x"]] });
  });

  it("should paste one value into one cell when one cell is selected", () => {
    expect(pastePlan({ top: 3, left: 2, bottom: 3, right: 2 }, [["x"]])).toEqual({ at: { row: 3, column: 2 }, block: [["x"]] });
  });
});

describe("clearRange", () => {
  it("should blank every selected cell and keep the column names when Delete is pressed", () => {
    const grid = { header: ["a", "b"], rows: [["1", "2"], ["3", "4"]] };
    expect(clearRange(grid, { top: -1, left: 1, bottom: 1, right: 1 })).toEqual({ header: ["a", "b"], rows: [["1", ""], ["3", ""]] });
  });

  it("should keep the same grid and rows when the block is already empty", () => {
    const grid = { header: ["a", "b"], rows: [["1", ""], ["3"], ["5", "6"]] };
    const cleared = clearRange(grid, { top: 0, left: 1, bottom: 1, right: 4 });
    expect(cleared).toBe(grid);
    expect(clearRange(grid, { top: 2, left: 1, bottom: 2, right: 1 }).rows[0]).toBe(grid.rows[0]);
  });

  it("should clear a whole sheet at the grid editor's size limit in one pass when everything is selected", () => {
    const rows = Array.from({ length: 5000 }, (_, row) => Array.from({ length: 100 }, (_, column) => `r${String(row)}c${String(column)}`));
    const started = performance.now();
    const cleared = clearRange({ header: [], rows }, { top: -1, left: 0, bottom: 4999, right: 99 });
    // Far above a single pass (tens of milliseconds); one setCell per cell took minutes.
    expect(performance.now() - started).toBeLessThan(10_000);
    expect(cleared.rows.every((row) => row.every((value) => value === ""))).toBe(true);
  });
});

describe("pasteFits", () => {
  const limits = { rows: 5000, columns: 100 };
  it("should allow a paste that keeps the grid inside the editor's limits", () => {
    expect(pasteFits({ at: { row: 10, column: 2 }, block: [["a", "b"]] }, { rows: 20, columns: 5 }, limits)).toBe(true);
  });

  it("should refuse a paste that would grow the grid past the editor's limits", () => {
    const tall = Array.from({ length: 4995 }, () => ["x"]);
    expect(pasteFits({ at: { row: 10, column: 0 }, block: tall }, { rows: 20, columns: 5 }, limits)).toBe(false);
    expect(pasteFits({ at: { row: 0, column: 99 }, block: [["a", "b"]] }, { rows: 20, columns: 100 }, limits)).toBe(false);
  });
});

describe("sameCell", () => {
  it("should match only the same row and column", () => {
    expect(sameCell({ row: 1, column: 2 }, { row: 1, column: 2 })).toBe(true);
    expect(sameCell({ row: 1, column: 2 }, { row: 2, column: 1 })).toBe(false);
  });
});

describe("selectionAfterKey", () => {
  const press = (key: string, modifiers: Partial<{ shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) => ({ key, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...modifiers });
  const bounds = { rows: 10, columns: 5, page: 4 };
  const noBlanks = () => false;
  const at = singleCell({ row: 2, column: 2 });

  it("should move one cell when an arrow, Enter, or Tab is pressed", () => {
    expect(selectionAfterKey(press("ArrowRight"), at, bounds, noBlanks, true)).toEqual(singleCell({ row: 2, column: 3 }));
    expect(selectionAfterKey(press("Enter"), at, bounds, noBlanks, true)).toEqual(singleCell({ row: 3, column: 2 }));
    expect(selectionAfterKey(press("Enter", { shiftKey: true }), at, bounds, noBlanks, true)).toEqual(singleCell({ row: 1, column: 2 }));
    expect(selectionAfterKey(press("Tab", { shiftKey: true }), at, bounds, noBlanks, true)).toEqual(singleCell({ row: 2, column: 1 }));
  });

  it("should extend from the anchor when Shift is held with arrows or Page Down", () => {
    const once = selectionAfterKey(press("ArrowDown", { shiftKey: true }), at, bounds, noBlanks, true);
    expect(once).toEqual({ anchor: { row: 2, column: 2 }, active: { row: 3, column: 2 } });
    if (once === null) return;
    expect(selectionAfterKey(press("PageDown", { shiftKey: true }), once, bounds, noBlanks, true)).toEqual({ anchor: { row: 2, column: 2 }, active: { row: 7, column: 2 } });
  });

  it("should jump to the edge of the data when Cmd or Ctrl is held with an arrow", () => {
    expect(selectionAfterKey(press("ArrowDown", { metaKey: true }), at, bounds, noBlanks, true)).toEqual(singleCell({ row: 9, column: 2 }));
    expect(selectionAfterKey(press("ArrowLeft", { ctrlKey: true, shiftKey: true }), at, bounds, noBlanks, true)).toEqual({ anchor: { row: 2, column: 2 }, active: { row: 2, column: 0 } });
  });

  it("should select everything when Cmd or Ctrl+A is pressed", () => {
    expect(selectionAfterKey(press("a", { metaKey: true }), at, bounds, noBlanks, true)).toEqual(selectAll(bounds));
  });

  it("should leave Tab to the page when the grid does not move with it, and ignore other keys", () => {
    expect(selectionAfterKey(press("Tab"), at, bounds, noBlanks, false)).toBeNull();
    expect(selectionAfterKey(press("x"), at, bounds, noBlanks, true)).toBeNull();
    expect(selectionAfterKey(press("ArrowDown", { altKey: true }), at, bounds, noBlanks, true)).toBeNull();
  });
});
