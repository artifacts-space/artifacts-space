import { describe, expect, it } from "vitest";

import { detectColumnType, detectColumnTypes, parseDate, parseNumber } from "./csv-values";

describe("parseNumber", () => {
  it("should read plain, negative, decimal, and scientific numbers when given", () => {
    expect(parseNumber("42")).toBe(42);
    expect(parseNumber(" -3.5 ")).toBe(-3.5);
    expect(parseNumber("1e3")).toBe(1000);
  });

  it("should read thousands commas, currency marks, and percents when present", () => {
    expect(parseNumber("1,234.5")).toBe(1234.5);
    expect(parseNumber("$12")).toBe(12);
    expect(parseNumber("-€1,000")).toBe(-1000);
    expect(parseNumber("12%")).toBe(12);
  });

  it("should return null when the value is blank or not a number", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("  ")).toBeNull();
    expect(parseNumber("12 apples")).toBeNull();
    expect(parseNumber("1,23")).toBeNull();
    expect(parseNumber("$")).toBeNull();
    expect(parseNumber("%")).toBeNull();
  });
});

describe("parseDate", () => {
  it("should read year-first dates and times when given", () => {
    expect(parseDate("2026-11-07")).toBe(Date.parse("2026-11-07"));
    expect(parseDate("2026/11/07")).toBe(Date.parse("2026-11-07"));
    expect(parseDate("2026-11-07T09:30:00Z")).toBe(Date.parse("2026-11-07T09:30:00Z"));
  });

  it("should return null when the date is ambiguous or invalid", () => {
    expect(parseDate("03/04/2026")).toBeNull();
    expect(parseDate("2026-13-45")).toBeNull();
    expect(parseDate("2026")).toBeNull();
    expect(parseDate("")).toBeNull();
  });
});

describe("detectColumnType", () => {
  it("should say number when every non-blank value is a number", () => {
    expect(detectColumnType(["10", "", "2.5", "1,000"])).toBe("number");
  });

  it("should say date when every non-blank value is a date", () => {
    expect(detectColumnType(["2026-11-07", "", "2025-01-31"])).toBe("date");
  });

  it("should say text when values are mixed", () => {
    expect(detectColumnType(["10", "ten"])).toBe("text");
    expect(detectColumnType(["2026-11-07", "12"])).toBe("text");
  });

  it("should say text when the column is blank", () => {
    expect(detectColumnType(["", " "])).toBe("text");
  });
});

describe("detectColumnTypes", () => {
  it("should count missing cells as blank when rows are ragged", () => {
    expect(detectColumnTypes([["a", "1"], ["b"]], 3)).toEqual(["text", "number", "text"]);
  });
});
