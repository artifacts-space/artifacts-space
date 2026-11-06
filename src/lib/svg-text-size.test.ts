import { describe, expect, it } from "vitest";

import { minReadableWidth, smallestFontSize } from "./svg-text-size";

describe("smallestFontSize", () => {
  it("should find the smallest px size across CSS and attributes", () => {
    const svg = `<svg><style>#m{font-size:16px;}.label{font-size: 14px}</style><text font-size="11">a</text><text style="font-size:12px">b</text></svg>`;
    expect(smallestFontSize(svg)).toBe(11);
  });

  it("should skip relative sizes and fall back to 16 when no px size is declared", () => {
    expect(smallestFontSize(`<svg><style>.a{font-size:0.8em}</style></svg>`)).toBe(16);
  });
});

describe("minReadableWidth", () => {
  it("should allow scaling down to 13/16 when the smallest text is 16px", () => {
    expect(minReadableWidth(800, 16)).toBe(650);
  });

  it("should ask for more than the drawn width when the smallest text is under 13px", () => {
    expect(minReadableWidth(500, 11)).toBe(591);
  });

  it("should ask for nothing when the size is unknown", () => {
    expect(minReadableWidth(0, 16)).toBe(0);
  });
});
