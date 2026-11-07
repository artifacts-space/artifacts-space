import { describe, expect, it } from "vitest";

import { highlightLimits, kindFromColor, toSyntaxLines, withinHighlightLimits } from "./tokens";

describe("kindFromColor", () => {
  it("should read the kind when the color is a syntax token variable", () => {
    expect(kindFromColor("var(--syntax-keyword)")).toBe("keyword");
  });

  it("should return null when the color is not a known syntax token", () => {
    expect(kindFromColor("var(--syntax-plain)")).toBeNull();
    expect(kindFromColor("#ff0000")).toBeNull();
    expect(kindFromColor(undefined)).toBeNull();
  });
});

describe("toSyntaxLines", () => {
  it("should merge neighbors of the same kind when building lines", () => {
    const lines = toSyntaxLines([
      [
        { content: "const", color: "var(--syntax-keyword)" },
        { content: " ", color: "var(--syntax-plain)" },
        { content: "x", color: "var(--syntax-plain)" },
        { content: " = ", color: "var(--syntax-punctuation)" },
        { content: "1", color: "var(--syntax-number)" },
      ],
    ]);
    expect(lines).toEqual([[
      { text: "const", kind: "keyword" },
      { text: " x", kind: null },
      { text: " = ", kind: "punctuation" },
      { text: "1", kind: "number" },
    ]]);
  });
});

describe("withinHighlightLimits", () => {
  it("should refuse code with too many lines when it passes the line limit", () => {
    expect(withinHighlightLimits("a\n".repeat(highlightLimits.lines))).toBe(false);
    expect(withinHighlightLimits("a\nb")).toBe(true);
  });

  it("should refuse code with too many characters when it passes the size limit", () => {
    expect(withinHighlightLimits("a".repeat(highlightLimits.characters + 1))).toBe(false);
  });
});
