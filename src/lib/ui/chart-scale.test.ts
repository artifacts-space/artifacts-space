import { describe, expect, it } from "vitest";

import { niceScale, scalePosition, visibleLabelIndexes } from "./chart-scale";

describe("niceScale", () => {
  it("should round bounds outward and include zero when values are positive", () => {
    const scale = niceScale([12, 19, 8, 22]);
    expect(scale.min).toBe(0);
    expect(scale.max).toBe(30);
    expect(scale.ticks).toEqual([0, 10, 20, 30]);
  });

  it("should span below zero when values are negative", () => {
    const scale = niceScale([-20, 35]);
    expect(scale.min).toBeLessThanOrEqual(-20);
    expect(scale.max).toBeGreaterThanOrEqual(35);
    expect(scale.ticks).toContain(0);
  });

  it("should give a unit axis when data is empty or all null", () => {
    expect(niceScale([])).toMatchObject({ min: 0, max: 1 });
    expect(niceScale([null, null])).toMatchObject({ min: 0, max: 1 });
  });

  it("should stay finite when values are near the largest double", () => {
    const scale = niceScale([Number.MAX_VALUE, -Number.MAX_VALUE]);
    expect(Number.isFinite(scale.min)).toBe(true);
    expect(Number.isFinite(scale.max)).toBe(true);
    expect(scale.ticks.length).toBeGreaterThan(1);
    expect(scale.ticks.every(Number.isFinite)).toBe(true);
  });

  it("should keep tick count bounded when values are tiny", () => {
    expect(niceScale([1e-300, 2e-300]).ticks.length).toBeLessThanOrEqual(13);
  });
});

describe("scalePosition", () => {
  it("should map bounds to 0 and 1 and clamp outside values", () => {
    const scale = niceScale([0, 100]);
    expect(scalePosition(0, scale)).toBe(0);
    expect(scalePosition(100, scale)).toBe(1);
    expect(scalePosition(500, scale)).toBe(1);
  });

  it("should not overflow when the span is huge", () => {
    const scale = niceScale([Number.MAX_VALUE, -Number.MAX_VALUE]);
    const position = scalePosition(0, scale);
    expect(position).toBeGreaterThan(0.4);
    expect(position).toBeLessThan(0.6);
  });
});

describe("visibleLabelIndexes", () => {
  it("should show every label when there are few", () => {
    expect(visibleLabelIndexes(4, 8)).toEqual([0, 1, 2, 3]);
  });

  it("should thin labels and keep the last when there are many", () => {
    const indexes = visibleLabelIndexes(200, 8);
    expect(indexes.length).toBeLessThanOrEqual(8);
    expect(indexes[0]).toBe(0);
    expect(indexes.at(-1)).toBe(199);
  });

  it("should return nothing when there are no labels", () => {
    expect(visibleLabelIndexes(0, 8)).toEqual([]);
  });
});
