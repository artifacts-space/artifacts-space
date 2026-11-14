import { describe, expect, it } from "vitest";

import { hasTitleText } from "./title-rules";

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
