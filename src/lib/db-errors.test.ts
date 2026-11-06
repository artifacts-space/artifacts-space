import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "./db-errors";

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
