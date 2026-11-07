import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  ariaSort,
  columnWidths,
  emptyColumnFilter,
  initialViewState,
  matchesColumnFilter,
  matchesQuickFilter,
  nextSort,
  sortRowIndexes,
  viewRowIndexes,
} from "./csv-view-rules";

const all = (rows: readonly unknown[]) => rows.map((_, index) => index);

describe("nextSort", () => {
  it("should cycle ascending, descending, then off when the same header is clicked", () => {
    const first = nextSort(null, 2);
    expect(first).toEqual({ column: 2, direction: "asc" });
    const second = nextSort(first, 2);
    expect(second).toEqual({ column: 2, direction: "desc" });
    expect(nextSort(second, 2)).toBeNull();
  });

  it("should start ascending when another header is clicked", () => {
    expect(nextSort({ column: 1, direction: "desc" }, 3)).toEqual({ column: 3, direction: "asc" });
  });
});

describe("ariaSort", () => {
  it("should name the direction only for the sorted column", () => {
    expect(ariaSort({ column: 1, direction: "desc" }, 1)).toBe("descending");
    expect(ariaSort({ column: 1, direction: "asc" }, 0)).toBe("none");
    expect(ariaSort(null, 0)).toBe("none");
  });
});

describe("sortRowIndexes", () => {
  const rows = [["10"], ["9"], ["100"], ["1,000"]];

  it("should sort numerically when the column is numbers", () => {
    expect(sortRowIndexes(rows, all(rows), { column: 0, direction: "asc" }, "number")).toEqual([1, 0, 2, 3]);
  });

  it("should sort as text when the column is text, so thousands commas do not count", () => {
    expect(sortRowIndexes(rows, all(rows), { column: 0, direction: "asc" }, "text")).toEqual([3, 1, 0, 2]);
  });

  it("should put item 2 before item 10 when text holds numbers", () => {
    const names = [["item 10"], ["Item 2"], ["item 1"]];
    expect(sortRowIndexes(names, all(names), { column: 0, direction: "asc" }, "text")).toEqual([2, 1, 0]);
  });

  it("should put empty cells last when sorting in either direction", () => {
    const withBlanks = [[""], ["3"], [], ["1"]];
    expect(sortRowIndexes(withBlanks, all(withBlanks), { column: 0, direction: "asc" }, "number")).toEqual([3, 1, 0, 2]);
    expect(sortRowIndexes(withBlanks, all(withBlanks), { column: 0, direction: "desc" }, "number")).toEqual([1, 3, 0, 2]);
  });

  it("should sort by time when the column is dates", () => {
    const dates = [["2026-11-07"], ["2025-01-31"], ["2026/02/01"]];
    expect(sortRowIndexes(dates, all(dates), { column: 0, direction: "desc" }, "date")).toEqual([0, 2, 1]);
  });

  it("should keep file order when values are equal", () => {
    const ties = [["b", "1"], ["a", "1"], ["c", "0"]];
    expect(sortRowIndexes(ties, all(ties), { column: 1, direction: "asc" }, "number")).toEqual([2, 0, 1]);
  });
});

describe("matchesColumnFilter", () => {
  it("should match text that contains the needle when case differs", () => {
    expect(matchesColumnFilter("Berlin", { ...emptyColumnFilter, contains: "ERL" })).toBe(true);
    expect(matchesColumnFilter("Paris", { ...emptyColumnFilter, contains: "erl" })).toBe(false);
  });

  it("should keep numbers inside the range when min or max is set", () => {
    const filter = { ...emptyColumnFilter, min: "10", max: "1,000" };
    expect(matchesColumnFilter("10", filter)).toBe(true);
    expect(matchesColumnFilter("$999", filter)).toBe(true);
    expect(matchesColumnFilter("9", filter)).toBe(false);
    expect(matchesColumnFilter("1001", filter)).toBe(false);
  });

  it("should drop blank and non-number cells when a range is set", () => {
    expect(matchesColumnFilter("", { ...emptyColumnFilter, min: "0" })).toBe(false);
    expect(matchesColumnFilter("n/a", { ...emptyColumnFilter, max: "5" })).toBe(false);
  });

  it("should match everything when the filter is empty or the range does not parse", () => {
    expect(matchesColumnFilter("", emptyColumnFilter)).toBe(true);
    expect(matchesColumnFilter("x", { ...emptyColumnFilter, min: "abc" })).toBe(true);
  });
});

describe("matchesQuickFilter", () => {
  it("should match when any shown column holds the text", () => {
    expect(matchesQuickFilter(["Ada", "London"], "lond", 2)).toBe(true);
    expect(matchesQuickFilter(["Ada", "London"], "paris", 2)).toBe(false);
  });

  it("should ignore columns past the shown count", () => {
    expect(matchesQuickFilter(["Ada", "London"], "lond", 1)).toBe(false);
  });

  it("should match every row when the text is blank", () => {
    expect(matchesQuickFilter([], "  ", 0)).toBe(true);
  });
});

describe("viewRowIndexes", () => {
  const rows = [
    ["Ada", "London", "36"],
    ["Lin", "Paris", "29"],
    ["Grace", "London", ""],
    ["Alan", "Leeds", "41"],
  ];
  const types = ["text", "text", "number"] as const;

  it("should filter, then sort, when both are set", () => {
    const view = { sort: { column: 2, direction: "desc" as const }, quick: "l", filters: { 1: { ...emptyColumnFilter, contains: "l" } } };
    expect(viewRowIndexes(rows, types, view)).toEqual([3, 0, 2]);
  });

  it("should keep every row in file order when nothing is set", () => {
    expect(viewRowIndexes(rows, types, initialViewState)).toEqual([0, 1, 2, 3]);
  });

  it("should apply a number range when a column filter has min and max", () => {
    const view = { ...initialViewState, filters: { 2: { ...emptyColumnFilter, min: "30", max: "40" } } };
    expect(viewRowIndexes(rows, types, view)).toEqual([0]);
  });

  it("should ignore a sort past the shown columns", () => {
    expect(viewRowIndexes(rows, types, { ...initialViewState, sort: { column: 9, direction: "asc" } })).toEqual([0, 1, 2, 3]);
  });
});

describe("activeFilterCount", () => {
  it("should count only filters with a field set", () => {
    expect(activeFilterCount({ ...initialViewState, filters: { 0: emptyColumnFilter, 1: { ...emptyColumnFilter, max: "3" } } })).toBe(1);
  });
});

describe("columnWidths", () => {
  it("should size columns between 6 and 36 ch from the header and values", () => {
    expect(columnWidths(["id", "description"], [["1", "x".repeat(80)]], 2)).toEqual([7, 36]);
  });

  it("should measure only the first line when a value has line breaks", () => {
    expect(columnWidths(["n"], [["short\n" + "y".repeat(40)]], 1)).toEqual([6]);
  });
});
