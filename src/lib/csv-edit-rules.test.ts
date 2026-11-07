import { describe, expect, it } from "vitest";

import { parseCsv, serializeCsv } from "./csv";
import {
  cellValue,
  deleteColumn,
  deleteRow,
  gridWidth,
  insertColumn,
  insertRow,
  parseClipboardBlock,
  pasteBlock,
  renameColumn,
  setCell,
  type CsvGrid,
} from "./csv-edit-rules";

const grid: CsvGrid = {
  header: ["name", "city"],
  rows: [
    ["Ada", "London"],
    ["Lin", "Paris"],
  ],
};

describe("setCell", () => {
  it("should change one cell and leave the rest when a value is set", () => {
    const next = setCell(grid, { row: 1, column: 0 }, "Grace");
    expect(next.rows).toEqual([["Ada", "London"], ["Grace", "Paris"]]);
    expect(next.rows[0]).toBe(grid.rows[0]);
  });

  it("should pad a short row when a cell past its end is set", () => {
    const ragged: CsvGrid = { header: ["a", "b", "c"], rows: [["1"]] };
    expect(setCell(ragged, { row: 0, column: 2 }, "x").rows).toEqual([["1", "", "x"]]);
  });

  it("should return the same grid when the value does not change", () => {
    expect(setCell(grid, { row: 0, column: 0 }, "Ada")).toBe(grid);
  });

  it("should rename the column when the header row is set", () => {
    expect(setCell(grid, { row: -1, column: 1 }, "town").header).toEqual(["name", "town"]);
  });
});

describe("renameColumn", () => {
  it("should keep the data when a header is renamed", () => {
    const next = renameColumn(grid, 0, "person");
    expect(next.header).toEqual(["person", "city"]);
    expect(next.rows).toBe(grid.rows);
    expect(parseCsv(serializeCsv(next.header, next.rows)).rows).toEqual(grid.rows);
  });
});

describe("rows", () => {
  it("should insert a blank row as wide as the grid when a row is added", () => {
    expect(insertRow(grid, 1).rows).toEqual([["Ada", "London"], ["", ""], ["Lin", "Paris"]]);
  });

  it("should append when the insert position is past the end", () => {
    expect(insertRow(grid, 9).rows).toHaveLength(3);
  });

  it("should remove the row when a row is deleted", () => {
    expect(deleteRow(grid, 0).rows).toEqual([["Lin", "Paris"]]);
    expect(deleteRow(grid, 5)).toBe(grid);
  });
});

describe("columns", () => {
  it("should insert a named blank column when a column is added", () => {
    const next = insertColumn(grid, 1);
    expect(next.header).toEqual(["name", "Column 2", "city"]);
    expect(next.rows).toEqual([["Ada", "", "London"], ["Lin", "", "Paris"]]);
  });

  it("should give full rows a blank cell and leave already-short rows alone when a column is added at the end", () => {
    const next = insertColumn({ header: ["a", "b"], rows: [["1", "2"], ["3"]] }, 2, "c");
    expect(next.header).toEqual(["a", "b", "c"]);
    expect(next.rows).toEqual([["1", "2", ""], ["3"]]);
  });

  it("should remove the column from the header and every row when a column is deleted", () => {
    const next = deleteColumn(grid, 0);
    expect(next).toEqual({ header: ["city"], rows: [["London"], ["Paris"]] });
  });
});

describe("parseClipboardBlock", () => {
  it("should read tab-separated lines as a block when copied from a spreadsheet", () => {
    expect(parseClipboardBlock("a\tb\r\nc\td\r\n")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("should keep tabs and line breaks inside quoted cells when Sheets quotes them", () => {
    expect(parseClipboardBlock('"two\nlines"\tx\ny\tz')).toEqual([["two\nlines", "x"], ["y", "z"]]);
  });

  it("should keep a single value exactly when it has no tab or line break", () => {
    expect(parseClipboardBlock('say "hi", ok')).toEqual([['say "hi", ok']]);
  });
});

describe("pasteBlock", () => {
  it("should grow rows and columns when a block is pasted into the middle and runs past the edge", () => {
    const result = pasteBlock(grid, { row: 1, column: 1 }, parseClipboardBlock("x\ty\tz\np\tq\tr"));
    expect(result.grid.header).toEqual(["name", "city", "Column 3", "Column 4"]);
    expect(result.grid.rows).toEqual([
      ["Ada", "London", "", ""],
      ["Lin", "x", "y", "z"],
      ["", "p", "q", "r"],
    ]);
    expect(result.from).toEqual({ row: 1, column: 1 });
    expect(result.to).toEqual({ row: 2, column: 3 });
    expect(gridWidth(result.grid)).toBe(4);
  });

  it("should rename columns when the block starts on the header row", () => {
    const result = pasteBlock(grid, { row: -1, column: 0 }, [["who", "where"], ["Grace", "NYC"]]);
    expect(result.grid.header).toEqual(["who", "where"]);
    expect(cellValue(result.grid, { row: 0, column: 1 })).toBe("NYC");
  });

  it("should change nothing when the block is empty", () => {
    expect(pasteBlock(grid, { row: 0, column: 0 }, []).grid).toBe(grid);
  });
});
