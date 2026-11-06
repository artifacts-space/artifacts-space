import { describe, expect, it } from "vitest";

import { foldPieEntries, maxPieSlices, otherLabel, pieSlices, slicePath } from "./chart-pie";

describe("foldPieEntries", () => {
  it("should keep every entry in order when there are few", () => {
    expect(foldPieEntries(["a", "b"], [3, 1]).map((entry) => entry.label)).toEqual(["a", "b"]);
  });

  it("should treat missing and negative values as zero", () => {
    expect(foldPieEntries(["a", "b", "c"], [null, -4, 2]).map((entry) => entry.value)).toEqual([0, 0, 2]);
  });

  it("should fold the smallest into Other when there are more than the slice limit", () => {
    const labels = Array.from({ length: 20 }, (_, index) => `L${String(index)}`);
    const values = labels.map((_, index) => index + 1);
    const entries = foldPieEntries(labels, values);
    expect(entries).toHaveLength(maxPieSlices);
    expect(entries.at(-1)).toEqual({ label: otherLabel, value: 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 + 11 + 12 + 13, index: -1 });
    expect(entries.slice(0, -1).map((entry) => entry.index)).toEqual([13, 14, 15, 16, 17, 18, 19]);
  });
});

describe("pieSlices", () => {
  it("should start at twelve o'clock and close the circle when values are positive", () => {
    const slices = pieSlices(foldPieEntries(["a", "b", "c"], [1, 1, 2]));
    expect(slices[0]?.start).toBe(0);
    expect(slices[2]?.fraction).toBeCloseTo(0.5);
    expect(slices.at(-1)?.end).toBeCloseTo(Math.PI * 2);
  });

  it("should give every slice zero size when all values are zero", () => {
    const slices = pieSlices(foldPieEntries(["a", "b"], [0, 0]));
    expect(slices.every((slice) => slice.fraction === 0 && slice.end === 0)).toBe(true);
  });

  it("should keep fractions finite when values are near the largest double", () => {
    const slices = pieSlices(foldPieEntries(["a", "b"], [Number.MAX_VALUE, Number.MAX_VALUE]));
    expect(slices.map((slice) => slice.fraction)).toEqual([0.5, 0.5]);
  });
});

describe("slicePath", () => {
  it("should draw a wedge to the center when there is no hole", () => {
    const path = slicePath({ start: 0, end: Math.PI / 2 }, 100, 90);
    expect(path).toMatch(/^M 100\.000 10\.000 A 90 90 0 0 1 190\.000 100\.000 L 100 100 Z$/);
  });

  it("should set the large-arc flag when a slice passes half the circle", () => {
    expect(slicePath({ start: 0, end: Math.PI * 1.5 }, 100, 90)).toContain(" 0 1 1 ");
  });

  it("should draw a full ring with a hole when one slice fills a donut", () => {
    const path = slicePath({ start: 0, end: Math.PI * 2 }, 100, 90, 50);
    expect(path.match(/M /g)).toHaveLength(2);
    expect(path).not.toContain("NaN");
  });
});
