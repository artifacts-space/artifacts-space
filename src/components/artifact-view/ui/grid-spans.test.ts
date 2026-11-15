import { describe, expect, it } from "vitest";

import { gridSpanClass } from "./grid-spans";

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
