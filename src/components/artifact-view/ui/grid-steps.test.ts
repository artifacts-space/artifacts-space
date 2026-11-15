import { describe, expect, it } from "vitest";

import { gridColumnClass, gridSpanClass, gridSteps } from "./grid-steps";

const classes = (...args: Parameters<typeof gridSpanClass>) => gridSpanClass(...args).split(" ");

describe("gridSpanClass", () => {
  it("should span the full row on a phone and two columns from 576 pixels, when a child spans two of three", () => {
    expect(classes(2, 3)).toEqual(["col-span-1", "@xl/ui:col-span-2", "@[38rem]/ui:col-span-2"]);
  });

  it("should clamp a span to the columns each width shows, when a child spans three of four", () => {
    expect(classes(3, 4)).toEqual(["col-span-1", "@xl/ui:col-span-2", "@4xl/ui:col-span-3"]);
  });

  it("should take both phone columns, when the grid keeps two there", () => {
    expect(classes(4, 4, 2)).toEqual(["col-span-2", "@xl/ui:col-span-2", "@4xl/ui:col-span-4"]);
    expect(classes(1, 4, 2)).toEqual(["col-span-1", "@xl/ui:col-span-1", "@4xl/ui:col-span-1"]);
  });

  it("should span one column, when the entry is missing or the grid has one column", () => {
    expect(classes(undefined, 2)).toEqual(["col-span-1", "@xl/ui:col-span-1"]);
    expect(classes(3, 1)).toEqual(["col-span-1"]);
  });

  it("should use only the interface's container, never the window's breakpoints", () => {
    for (const name of [...classes(4, 4, 2), ...classes(3, 3)]) expect(name).not.toMatch(/^(sm|md|lg|xl|2xl):/);
  });
});

describe("gridColumnClass", () => {
  it("should draw the same columns at each step as the grid did before the steps shared one table", () => {
    expect(gridColumnClass(1)).toBe("grid-cols-1");
    expect(gridColumnClass(2)).toBe("grid-cols-1 @xl/ui:grid-cols-2");
    expect(gridColumnClass(3)).toBe("grid-cols-1 @xl/ui:grid-cols-2 @[38rem]/ui:grid-cols-3");
    expect(gridColumnClass(4)).toBe("grid-cols-1 @xl/ui:grid-cols-2 @4xl/ui:grid-cols-4");
    expect(gridColumnClass(4, 2)).toBe("grid-cols-2 @xl/ui:grid-cols-2 @4xl/ui:grid-cols-4");
  });
});

describe("the width steps", () => {
  /** The class's container variant (empty below 576px) and its number: "@xl/ui:grid-cols-2" is ["@xl/ui:", 2]. */
  const parts = (name: string) => {
    const match = /^(.*?)(?:grid-cols|col-span)-(\d)$/.exec(name);
    return [match?.[1] ?? "?", Number(match?.[2])] as const;
  };

  it.each([[1, 1], [2, 1], [3, 1], [4, 1], [2, 2], [3, 2], [4, 2]])("should give a child that spans every column the whole row at every step, for %i columns and %i on a phone", (columns, narrowColumns) => {
    const shown = gridColumnClass(columns, narrowColumns).split(" ").map(parts);
    const spanned = gridSpanClass(columns, columns, narrowColumns).split(" ").map(parts);
    expect(spanned).toEqual(shown);
  });

  it.each([[2, 1], [3, 1], [4, 1], [4, 2]])("should never span more columns than a step shows, for %i columns and %i on a phone", (columns, narrowColumns) => {
    const shown = gridColumnClass(columns, narrowColumns).split(" ").map(parts);
    for (let span = 1; span <= columns; span += 1) {
      gridSpanClass(span, columns, narrowColumns).split(" ").map(parts).forEach(([variant, count], index) => {
        expect(variant).toBe(shown[index]?.[0]);
        expect(count).toBeLessThanOrEqual(shown[index]?.[1] ?? 0);
      });
    }
  });

  it("should start each step wider than the one before it", () => {
    const starts = gridSteps.map((step) => step.from);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(new Set(starts).size).toBe(starts.length);
  });
});

