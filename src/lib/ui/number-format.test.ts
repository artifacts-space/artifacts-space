import { describe, expect, it } from "vitest";

import { formatCellValue, formatNumber, missingValue, sharedFractionDigits } from "./number-format";

describe("formatNumber", () => {
  it("should group digits and keep two decimals when the format is number", () => {
    expect(formatNumber(1234567.891)).toBe("1,234,567.89");
  });

  it("should trim trailing zeros when a plain number has fewer decimals", () => {
    expect(formatNumber(2.5)).toBe("2.5");
    expect(formatNumber(3)).toBe("3");
  });

  it("should shorten large values when the format is compact", () => {
    expect(formatNumber(1_250_000, "compact")).toBe("1.3M");
  });

  it("should keep small values non-zero when the format is compact", () => {
    expect(formatNumber(0.004, "compact")).toBe("0.004");
  });

  it("should add a percent sign without scaling when the format is percent", () => {
    expect(formatNumber(12.5, "percent")).toBe("12.5%");
    expect(formatNumber(0.004, "percent")).toBe("0.004%");
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

describe("formatNumber with currency", () => {
  it("should show no cents when the amount is whole, at any size", () => {
    expect(formatNumber(83, "currency")).toBe("$83");
    expect(formatNumber(141, "currency")).toBe("$141");
    expect(formatNumber(1430, "currency")).toBe("$1,430");
    expect(formatNumber(17_154, "currency")).toBe("$17,154");
  });

  it("should show two decimals when the amount has cents, at any size", () => {
    expect(formatNumber(28.5, "currency")).toBe("$28.50");
    expect(formatNumber(1234.5, "currency")).toBe("$1,234.50");
    expect(formatNumber(12.5, "currency", "eur")).toBe("€12.50");
  });

  it("should treat float noise as a whole amount when it rounds to whole cents", () => {
    expect(formatNumber(83.000000001, "currency")).toBe("$83");
    expect(formatNumber(0.1 + 0.2, "currency")).toBe("$0.30");
  });

  it("should keep two significant digits when the amount is under one cent", () => {
    expect(formatNumber(0.004, "currency")).toBe("$0.004");
    expect(formatNumber(0.00437, "currency")).toBe("$0.0044");
    expect(formatNumber(0.006, "currency")).toBe("$0.006");
    expect(formatNumber(-0.004, "currency")).toBe("-$0.004");
  });

  it("should show cents when the amount is under one dollar but at least one cent", () => {
    expect(formatNumber(0.06, "currency")).toBe("$0.06");
    expect(formatNumber(0.77, "currency")).toBe("$0.77");
  });

  it("should show zero as a whole amount", () => {
    expect(formatNumber(0, "currency")).toBe("$0");
  });

  it("should follow the currency's minor unit when it has none", () => {
    expect(formatNumber(1500, "currency", "JPY")).toBe("¥1,500");
    expect(formatNumber(0.5, "currency", "JPY")).toBe("¥0.5");
  });
});

describe("sharedFractionDigits", () => {
  it("should share two decimals when any amount in a column has cents", () => {
    const column = [83, 141, 28.5];
    const shared = sharedFractionDigits(column, "currency");
    expect(column.map((value) => formatNumber(value, "currency", "USD", shared))).toEqual(["$83.00", "$141.00", "$28.50"]);
  });

  it("should share no decimals when every amount in a column is whole", () => {
    const column = [0, 10, 20, 30];
    const shared = sharedFractionDigits(column, "currency");
    expect(column.map((value) => formatNumber(value, "currency", "USD", shared))).toEqual(["$0", "$10", "$20", "$30"]);
  });

  it("should keep a sub-cent amount's own digits when the column shares cents", () => {
    const column = [0.004, 0.07, 1.01];
    const shared = sharedFractionDigits(column, "currency");
    expect(column.map((value) => formatNumber(value, "currency", "USD", shared))).toEqual(["$0.004", "$0.07", "$1.01"]);
  });

  it("should align plain numbers to the most decimals in the set", () => {
    const column = [1, 2.5, 3.25];
    const shared = sharedFractionDigits(column, "number");
    expect(column.map((value) => formatNumber(value, "number", "USD", shared))).toEqual(["1.00", "2.50", "3.25"]);
  });

  it("should skip missing values and share nothing for compact numbers", () => {
    expect(sharedFractionDigits([null, undefined, 2], "currency")).toBe(0);
    expect(sharedFractionDigits([1.5, 2.25], "compact")).toBe(0);
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
    expect(formatCellValue(1234.5, "currency", "USD")).toBe("$1,234.50");
    expect(formatCellValue(1234.5, "text", "USD")).toBe("1234.5");
  });

  it("should use the column's shared decimals when given", () => {
    expect(formatCellValue(83, "currency", "USD", 2)).toBe("$83.00");
  });
});
