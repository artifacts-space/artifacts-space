import { describe, expect, it } from "vitest";

import {
  appliedWidths,
  columnKeys,
  dropLineX,
  dropTarget,
  emptySheetPrefs,
  fitWidth,
  isNaturalOrder,
  moveColumn,
  moveItem,
  normalizeOrder,
  parseSheetPrefs,
  resizedWidth,
  serializeSheetPrefs,
  sheetPrefsKey,
} from "./sheet-column-rules";
import { columnOffsets, maxColumnWidth, minColumnWidth } from "./sheet-grid-rules";

describe("moveItem", () => {
  it("should move an item forward and back when given two places", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("should leave the list as it was when a place is out of range", () => {
    expect(moveItem(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });
});

describe("moveColumn", () => {
  it("should move the header and every row's cell when a column is dragged", () => {
    const grid = { header: ["id", "name", "score"], rows: [["1", "Ada", "10"], ["2", "Lin", "9"]] };
    expect(moveColumn(grid, 2, 0)).toEqual({ header: ["score", "id", "name"], rows: [["10", "1", "Ada"], ["9", "2", "Lin"]] });
  });

  it("should leave short rows that end before both places as they were", () => {
    const grid = { header: ["a", "b", "c", "d"], rows: [["1"], ["1", "2", "3", "4"]] };
    const moved = moveColumn(grid, 2, 3);
    expect(moved.rows[0]).toBe(grid.rows[0]);
    expect(moved.rows[1]).toEqual(["1", "2", "4", "3"]);
  });

  it("should not add blanks to a short row when the moved cell was missing anyway", () => {
    const grid = { header: ["a", "b", "c"], rows: [["1", "2"]] };
    expect(moveColumn(grid, 2, 0).rows[0]).toEqual(["", "1", "2"]);
    expect(moveColumn(grid, 0, 2).rows[0]).toEqual(["2", "", "1"]);
  });

  it("should return the same grid when the column does not move", () => {
    const grid = { header: ["a"], rows: [] };
    expect(moveColumn(grid, 0, 0)).toBe(grid);
  });
});

describe("normalizeOrder", () => {
  it("should keep a saved order when it still fits the file", () => {
    expect(normalizeOrder([2, 0, 1], 3)).toEqual([2, 0, 1]);
  });

  it("should drop gone and repeated columns and add new ones at the end when the file changed", () => {
    expect(normalizeOrder([4, 1, 1, -1, 0.5, 0], 3)).toEqual([1, 0, 2]);
    expect(normalizeOrder(undefined, 2)).toEqual([0, 1]);
  });

  it("should say whether an order is the file's own", () => {
    expect(isNaturalOrder([0, 1, 2])).toBe(true);
    expect(isNaturalOrder([1, 0, 2])).toBe(false);
  });
});

describe("dropTarget", () => {
  const offsets = columnOffsets([100, 100, 100, 100]);

  it("should land a column after the one whose middle the pointer passed when dragged right", () => {
    expect(dropTarget(offsets, 0, 260)).toBe(2);
    expect(dropTarget(offsets, 0, 390)).toBe(3);
  });

  it("should land a column before the one whose middle the pointer has not reached when dragged left", () => {
    expect(dropTarget(offsets, 3, 140)).toBe(1);
    expect(dropTarget(offsets, 3, -20)).toBe(0);
  });

  it("should stay in place when dropped on itself", () => {
    expect(dropTarget(offsets, 1, 120)).toBe(1);
    expect(dropTarget(offsets, 1, 180)).toBe(1);
  });

  it("should draw the drop line on the edge the column will land against", () => {
    expect(dropLineX(offsets, 0, 2)).toBe(300);
    expect(dropLineX(offsets, 3, 1)).toBe(100);
  });
});

describe("widths", () => {
  it("should fit the widest text plus padding when a column auto-fits", () => {
    expect(fitWidth([40, 171.2, 90])).toBe(200);
    expect(fitWidth([])).toBe(minColumnWidth);
    expect(fitWidth([5000])).toBe(maxColumnWidth);
  });

  it("should follow the pointer and stay in range when an edge is dragged", () => {
    expect(resizedWidth(120, 500, 560)).toBe(180);
    expect(resizedWidth(120, 500, 300)).toBe(minColumnWidth);
  });

  it("should key columns by name, counting repeats, and by place when unnamed", () => {
    expect(columnKeys(["id", "", "id", "score"], 5)).toEqual(["=id", "#1", "=id#2", "=score", "#4"]);
  });

  it("should use a viewer's own width when set and the default otherwise", () => {
    expect(appliedWidths([100, 120], ["=a", "=b"], { "=b": 300, "=gone": 90 })).toEqual([100, 300]);
    expect(appliedWidths([100], ["=a"], { "=a": 2 })).toEqual([minColumnWidth]);
  });
});

describe("sheet prefs storage", () => {
  it("should read back what it stored when the text is valid", () => {
    const prefs = { widths: { "=id": 90 }, order: [1, 0] };
    expect(parseSheetPrefs(serializeSheetPrefs(prefs))).toEqual(prefs);
    expect(parseSheetPrefs(serializeSheetPrefs({ widths: {}, order: null }))).toEqual(emptySheetPrefs);
  });

  it("should fall back to empty prefs when the stored text is missing, broken, or the wrong shape", () => {
    expect(parseSheetPrefs(null)).toEqual(emptySheetPrefs);
    expect(parseSheetPrefs("{not json")).toEqual(emptySheetPrefs);
    expect(parseSheetPrefs(JSON.stringify({ widths: { a: "wide" } }))).toEqual(emptySheetPrefs);
    expect(parseSheetPrefs(JSON.stringify({ order: [-1] }))).toEqual(emptySheetPrefs);
  });

  it("should cap how many widths it keeps when a sheet has very many columns", () => {
    const widths = Object.fromEntries(Array.from({ length: 800 }, (_, index) => [`#${String(index)}`, 100]));
    expect(Object.keys(parseSheetPrefs(serializeSheetPrefs({ widths, order: null })).widths)).toHaveLength(500);
  });

  it("should key prefs by artifact", () => {
    expect(sheetPrefsKey("abc")).toBe("sheet-view:v1:abc");
  });
});
