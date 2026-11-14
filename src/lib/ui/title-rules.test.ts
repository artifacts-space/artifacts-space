import { describe, expect, it } from "vitest";

import { hasTitleText, titleOr } from "./title-rules";

describe("hasTitleText", () => {
  it("should be false when the title is missing or empty", () => {
    expect(hasTitleText(undefined)).toBe(false);
    expect(hasTitleText("")).toBe(false);
  });

  it("should be false when the title is only spaces and line breaks", () => {
    expect(hasTitleText("   ")).toBe(false);
    expect(hasTitleText(" \n\t ")).toBe(false);
  });

  it("should be true when the title has words, with spaces around them or not", () => {
    expect(hasTitleText("Plan")).toBe(true);
    expect(hasTitleText("  Plan  ")).toBe(true);
  });
});

describe("titleOr", () => {
  it("should keep the title as written when it has words", () => {
    expect(titleOr("  Plan  ", "Item 1")).toBe("  Plan  ");
  });

  it("should use the fallback when the title is missing, empty, or only spaces", () => {
    expect(titleOr(undefined, "Item 1")).toBe("Item 1");
    expect(titleOr("", "Item 1")).toBe("Item 1");
    expect(titleOr(" \n ", "Tab 2")).toBe("Tab 2");
  });
});
