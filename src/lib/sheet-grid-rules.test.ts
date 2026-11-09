import { describe, expect, it } from "vitest";

import {
  clampColumnWidth,
  columnOffsets,
  columnSpan,
  maxColumnWidth,
  minColumnWidth,
  pixelWidth,
  revealCell,
  rowNumberWidth,
  rowSpan,
  rowsPerPage,
  sheetFillMaxHeight,
  sheetHeaderHeight,
  sheetRowHeight,
  withKept,
} from "./sheet-grid-rules";

describe("column widths", () => {
  it("should keep a width between the narrowest and widest column when it is out of range", () => {
    expect(clampColumnWidth(5)).toBe(minColumnWidth);
    expect(clampColumnWidth(5000)).toBe(maxColumnWidth);
    expect(clampColumnWidth(120.6)).toBe(121);
  });

  it("should turn a width in characters into pixels with room for padding when sizing a default column", () => {
    expect(pixelWidth(10)).toBe(104);
    expect(pixelWidth(0)).toBe(minColumnWidth);
  });

  it("should list where each column starts and the total width when given widths", () => {
    expect(columnOffsets([100, 50, 80])).toEqual([0, 100, 150, 230]);
    expect(columnOffsets([])).toEqual([0]);
  });
});

describe("columnSpan", () => {
  const offsets = columnOffsets(Array.from({ length: 50 }, () => 100));

  it("should render only the columns on screen plus overscan when scrolled sideways", () => {
    expect(columnSpan(offsets, 1000, 400, 2)).toEqual({ start: 8, end: 17 });
  });

  it("should stop at the first and last column when the view is at an edge", () => {
    expect(columnSpan(offsets, 0, 400, 2)).toEqual({ start: 0, end: 7 });
    expect(columnSpan(offsets, 4600, 400, 2)).toEqual({ start: 44, end: 50 });
  });

  it("should render nothing when there are no columns", () => {
    expect(columnSpan([0], 0, 400, 2)).toEqual({ start: 0, end: 0 });
  });

  it("should still find the columns when they have different widths", () => {
    const mixed = columnOffsets([40, 300, 60, 60, 500]);
    expect(columnSpan(mixed, 350, 100, 0)).toEqual({ start: 2, end: 4 });
  });
});

describe("rowSpan", () => {
  it("should render only the rows on screen plus overscan when scrolled down", () => {
    const height = sheetHeaderHeight + 10 * sheetRowHeight;
    expect(rowSpan(100 * sheetRowHeight, height, 1000, 5)).toEqual({ start: 95, end: 116 });
  });

  it("should stop at the last row when the table is short", () => {
    expect(rowSpan(0, 600, 8, 5)).toEqual({ start: 0, end: 8 });
    expect(rowSpan(0, 600, 0, 5)).toEqual({ start: 0, end: 0 });
  });
});

describe("revealCell", () => {
  const offsets = columnOffsets(Array.from({ length: 20 }, () => 100));
  const box = { top: 0, left: 0, width: rowNumberWidth + 400, height: sheetHeaderHeight + 10 * sheetRowHeight };

  it("should not scroll when the cell is already in view", () => {
    expect(revealCell(box, { row: 3, column: 2 }, offsets)).toEqual({ top: 0, left: 0 });
  });

  it("should scroll just far enough to show a cell below or right of the view", () => {
    expect(revealCell(box, { row: 10, column: 5 }, offsets)).toEqual({ top: sheetRowHeight, left: 200 });
  });

  it("should keep a cell above or left of the view clear of the frozen header and row numbers", () => {
    const scrolled = { ...box, top: 50 * sheetRowHeight, left: 900 };
    expect(revealCell(scrolled, { row: 20, column: 3 }, offsets)).toEqual({ top: 20 * sheetRowHeight, left: 300 });
  });

  it("should leave the vertical scroll alone when the header row is active", () => {
    const scrolled = { ...box, top: 400 };
    expect(revealCell(scrolled, { row: -1, column: 0 }, offsets)).toEqual({ top: 400, left: 0 });
  });

  it("should show the start of a column wider than the view", () => {
    const wide = columnOffsets([100, 2000]);
    expect(revealCell(box, { row: 0, column: 1 }, wide)).toEqual({ top: 0, left: 100 });
  });
});

describe("rowsPerPage", () => {
  it("should move by a screenful less one row when paging", () => {
    expect(rowsPerPage(sheetHeaderHeight + 20 * sheetRowHeight)).toBe(19);
  });

  it("should move at least one row when the view is tiny", () => {
    expect(rowsPerPage(10)).toBe(1);
  });
});

describe("sheetFillMaxHeight", () => {
  it("should fill to the bottom of the window with a floor when the grid starts lower on the page", () => {
    expect(sheetFillMaxHeight(300.4)).toBe("max(calc(100svh - 316px), calc((100svh - var(--artifact-chrome-height, 0px)) * 0.6), 240px)");
  });
});

describe("withKept", () => {
  it("should list the span when the kept index is inside it or below zero", () => {
    expect(withKept({ start: 2, end: 5 }, 3)).toEqual([2, 3, 4]);
    expect(withKept({ start: 2, end: 5 }, -1)).toEqual([2, 3, 4]);
  });

  it("should add the kept index in order when it is outside the span", () => {
    expect(withKept({ start: 2, end: 5 }, 0)).toEqual([0, 2, 3, 4]);
    expect(withKept({ start: 2, end: 5 }, 9)).toEqual([2, 3, 4, 9]);
  });
});
