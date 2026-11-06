import { describe, expect, it } from "vitest";

import { flattenPoints, nearestIndex, sparklineShape } from "./chart-points";

describe("flattenPoints", () => {
  it("should order points from every series by x when flattening", () => {
    const points = flattenPoints([{ points: [{ x: 3, y: 1 }, { x: 1, y: 1 }] }, { points: [{ x: 2, y: 5, label: "b" }] }]);
    expect(points.map((point) => [point.series, point.x])).toEqual([[0, 1], [1, 2], [0, 3]]);
    expect(points[1]?.label).toBe("b");
  });
});

describe("nearestIndex", () => {
  it("should pick the closest position when several are near", () => {
    expect(nearestIndex([[0, 0], [10, 10], [4, 5]], 5, 5)).toBe(2);
  });

  it("should return -1 when there are no points", () => {
    expect(nearestIndex([], 1, 1)).toBe(-1);
  });
});

describe("sparklineShape", () => {
  it("should map the lowest value to the bottom and the highest to the top", () => {
    const shape = sparklineShape([1, 3, 2], 100, 20);
    expect(shape.runs).toEqual([[[0, 20], [50, 0], [100, 10]]]);
    expect(shape.last).toEqual([100, 10]);
  });

  it("should split runs at gaps when values are null", () => {
    expect(sparklineShape([1, null, 2, 3], 30, 10).runs).toHaveLength(2);
  });

  it("should center a flat series when every value is equal", () => {
    expect(sparklineShape([5, 5], 10, 10).runs[0]).toEqual([[0, 5], [10, 5]]);
  });

  it("should draw nothing when there are fewer than two numbers", () => {
    expect(sparklineShape([4, null], 10, 10)).toEqual({ runs: [], last: null });
  });

  it("should stay finite when values span the largest doubles", () => {
    const shape = sparklineShape([-Number.MAX_VALUE, Number.MAX_VALUE], 10, 10);
    expect(shape.runs.flat(2).every(Number.isFinite)).toBe(true);
  });
});
