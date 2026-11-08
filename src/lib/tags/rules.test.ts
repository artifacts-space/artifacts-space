import { describe, expect, it } from "vitest";

import { tagLimits } from "./limits";
import { applyTagChange, newTags, normalizeTag, rowTags, tagListSchema, tagSchema, vocabularyWouldOverflow } from "./rules";

describe("normalizeTag", () => {
  it("should trim, lowercase, and join words with dashes", () => {
    expect(normalizeTag("  Needs   Review ")).toBe("needs-review");
  });

  it("should drop a leading hash, commas, control characters, and stray dashes", () => {
    expect(normalizeTag("#Q4,\u0000 -- launch-- ")).toBe("q4-launch");
  });

  it("should leave nothing when the input is only separators", () => {
    expect(normalizeTag(" # , -- ")).toBe("");
  });
});

describe("tagSchema", () => {
  it("should accept a tag at the length limit and refuse one past it", () => {
    expect(tagSchema.safeParse("a".repeat(tagLimits.maxChars)).success).toBe(true);
    expect(tagSchema.safeParse("a".repeat(tagLimits.maxChars + 1)).success).toBe(false);
  });

  it("should count an emoji as one character", () => {
    expect(tagSchema.parse("🚀".repeat(tagLimits.maxChars))).toHaveLength(tagLimits.maxChars * 2);
  });
});

describe("tagListSchema", () => {
  it("should merge duplicates after normalizing and keep the first order", () => {
    expect(tagListSchema.parse(["Bug", "bug ", "UI", "#bug"])).toEqual(["bug", "ui"]);
  });

  it("should drop empty entries", () => {
    expect(tagListSchema.parse(["", "  ", "ok"])).toEqual(["ok"]);
  });

  it("should refuse more tags than an artifact may have", () => {
    const many = Array.from({ length: tagLimits.maxPerArtifact + 1 }, (_, index) => `t${String(index)}`);
    expect(tagListSchema.safeParse(many).success).toBe(false);
  });
});

describe("applyTagChange", () => {
  it("should replace the whole set when one is given", () => {
    expect(applyTagChange(["a", "b"], { set: ["C"] })).toEqual(["c"]);
  });

  it("should add and remove tags while keeping the rest in order", () => {
    expect(applyTagChange(["a", "b", "c"], { add: ["D", "a"], remove: ["B"] })).toEqual(["a", "c", "d"]);
  });

  it("should refuse an addition that passes the per-artifact cap", () => {
    const full = Array.from({ length: tagLimits.maxPerArtifact }, (_, index) => `t${String(index)}`);
    expect(() => applyTagChange(full, { add: ["one-more"], remove: [] })).toThrow();
  });
});

describe("vocabulary caps", () => {
  it("should list only the tags the scope does not use yet", () => {
    expect(newTags(["a", "b"], new Set(["a"]))).toEqual(["b"]);
  });

  it("should overflow only when new tags take the scope past its cap", () => {
    expect(vocabularyWouldOverflow(tagLimits.maxPerScope, 0)).toBe(false);
    expect(vocabularyWouldOverflow(tagLimits.maxPerScope - 1, 1)).toBe(false);
    expect(vocabularyWouldOverflow(tagLimits.maxPerScope, 1)).toBe(true);
  });
});

describe("rowTags", () => {
  it("should show two tags and count the rest", () => {
    expect(rowTags(["a", "b", "c", "d"])).toEqual({ visible: ["a", "b"], more: 2 });
    expect(rowTags(["a"])).toEqual({ visible: ["a"], more: 0 });
  });
});
