import { describe, expect, it } from "vitest";

import { stackSeries } from "./chart-stack";

describe("stackSeries", () => {
  it("should stack each series on top of the previous when values are positive", () => {
    const layout = stackSeries([[1, 2], [3, 4]], 2);
    expect(layout.segments[0]).toEqual([{ start: 0, end: 1 }, { start: 0, end: 2 }]);
    expect(layout.segments[1]).toEqual([{ start: 1, end: 4 }, { start: 2, end: 6 }]);
    expect(layout.totals).toEqual([4, 6]);
  });

  it("should stack negatives down from zero when signs are mixed", () => {
    const layout = stackSeries([[5], [-2], [3], [-4]], 1);
    expect(layout.segments.map((series) => series[0])).toEqual([
      { start: 0, end: 5 },
      { start: 0, end: -2 },
      { start: 5, end: 8 },
      { start: -2, end: -6 },
    ]);
    expect(layout.totals).toEqual([2]);
    expect(Math.max(...layout.extent)).toBe(8);
    expect(Math.min(...layout.extent)).toBe(-6);
  });

  it("should add nothing and give a null total when values are missing", () => {
    const layout = stackSeries([[null, 1], [2]], 2);
    expect(layout.segments[0]?.[0]).toEqual({ start: 0, end: 0 });
    expect(layout.segments[1]?.[1]).toEqual({ start: 1, end: 1 });
    expect(layout.totals).toEqual([2, 1]);
    expect(stackSeries([[null]], 1).totals).toEqual([null]);
  });

  it("should return empty segments when there are no labels", () => {
    expect(stackSeries([[], []], 0)).toEqual({ segments: [[], []], totals: [], extent: [] });
  });

  it("should never produce NaN segments when sums pass the largest double", () => {
    const layout = stackSeries([[Number.MAX_VALUE], [Number.MAX_VALUE]], 1);
    const ends = layout.segments.flatMap((series) => series.map((segment) => segment.end));
    expect(ends.some(Number.isNaN)).toBe(false);
  });
});
