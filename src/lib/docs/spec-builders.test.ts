import { describe, expect, it } from "vitest";

import { compactJson, single } from "./spec-builders";

describe("compactJson", () => {
  it("should keep short arrays on one line when they fit", () => {
    expect(compactJson({ labels: ["Q1", "Q2"] })).toBe('{ "labels": ["Q1", "Q2"] }');
  });

  it("should parse back to the same value when given a nested spec", () => {
    const value = single("Chart", { type: "bar", labels: Array.from({ length: 30 }, (_, index) => `Label ${String(index)}`), series: [{ name: "a, b", values: [1, -2, null] }] });
    expect(JSON.parse(compactJson(value))).toEqual(value);
  });

  it("should break long objects across lines when they do not fit", () => {
    const text = compactJson({ a: "x".repeat(80), b: 1 });
    expect(text.split("\n")).toHaveLength(4);
  });

  it("should not change commas inside strings when inlining", () => {
    expect(JSON.parse(compactJson({ text: "one,two:\"three\"" }))).toEqual({ text: "one,two:\"three\"" });
  });
});
