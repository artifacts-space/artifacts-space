import { describe, expect, it } from "vitest";

import { formatCellValue, formatNumber, missingValue } from "./number-format";

describe("formatNumber", () => {
  it("should group digits and keep two decimals when the format is number", () => {
    expect(formatNumber(1234567.891)).toBe("1,234,567.89");
  });

  it("should shorten large values when the format is compact", () => {
    expect(formatNumber(1_250_000, "compact")).toBe("1.3M");
  });

  it("should add a percent sign without scaling when the format is percent", () => {
    expect(formatNumber(12.5, "percent")).toBe("12.5%");
  });

  it("should format currency when the code is valid", () => {
    expect(formatNumber(1234.5, "currency", "USD")).toBe("$1,235");
    expect(formatNumber(12.5, "currency", "eur")).toBe("€12.50");
  });

  it("should fall back to the code when the currency is unknown", () => {
    expect(formatNumber(10, "currency", "ZZZ")).toMatch(/10/);
  });

  it("should switch to scientific notation when the value is huge", () => {
    expect(formatNumber(1e300)).toBe("1.00e+300");
    expect(formatNumber(-1e20, "compact")).toBe("-1.00e+20");
    expect(formatNumber(Number.MAX_VALUE, "currency")).toMatch(/^USD 1\.80e\+308$/);
  });

  it("should show a dash when the value is not finite", () => {
    expect(formatNumber(Number.NaN)).toBe(missingValue);
    expect(formatNumber(Number.POSITIVE_INFINITY, "percent")).toBe(missingValue);
  });
});

describe("formatCellValue", () => {
  it("should show a dash when the value is empty", () => {
    expect(formatCellValue(null, "number", "USD")).toBe(missingValue);
    expect(formatCellValue("", "text", "USD")).toBe(missingValue);
  });

  it("should show yes or no when the value is a boolean", () => {
    expect(formatCellValue(true, "text", "USD")).toBe("Yes");
  });

  it("should format numbers unless the format is text", () => {
    expect(formatCellValue(1234.5, "currency", "USD")).toBe("$1,235");
    expect(formatCellValue(1234.5, "text", "USD")).toBe("1234.5");
  });
});
