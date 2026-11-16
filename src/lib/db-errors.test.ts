import { describe, expect, it } from "vitest";

import { isDeadlock, isUndefinedTable, isUniqueViolation } from "./db-errors";

describe("isUniqueViolation", () => {
  it("should detect the code on the error itself", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("should detect the code on a wrapped cause", () => {
    expect(isUniqueViolation(new Error("query failed", { cause: { code: "23505" } }))).toBe(true);
  });

  it("should return false when the error is something else", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(new Error("nope"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe("isUndefinedTable", () => {
  it("should detect a missing table on the error itself and on a wrapped cause", () => {
    expect(isUndefinedTable({ code: "42P01" })).toBe(true);
    expect(isUndefinedTable(new Error("query failed", { cause: new Error("driver", { cause: { code: "42P01" } }) }))).toBe(true);
  });

  it("should return false when the error is something else", () => {
    expect(isUndefinedTable({ code: "42703" })).toBe(false);
    expect(isUndefinedTable(new Error("nope"))).toBe(false);
    expect(isUndefinedTable(undefined)).toBe(false);
  });
});

describe("isDeadlock", () => {
  it("should detect a deadlock on the error itself and on a wrapped cause", () => {
    expect(isDeadlock({ code: "40P01" })).toBe(true);
    expect(isDeadlock(new Error("query failed", { cause: { code: "40P01" } }))).toBe(true);
  });

  it("should return false when the error is something else, or the code sits deeper than a driver wraps it", () => {
    expect(isDeadlock({ code: "40001" })).toBe(false);
    const deep = { cause: { cause: { cause: { cause: { cause: { code: "40P01" } } } } } };
    expect(isDeadlock(deep)).toBe(false);
  });
});
