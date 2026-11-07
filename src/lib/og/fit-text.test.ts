import { describe, expect, it } from "vitest";

import { estimateLineCount, fitText } from "@/lib/og/fit-text";
import { OG_HEADLINE_TYPE, OG_TEXT_BOX } from "@/lib/og/theme";
import { OG_HEADLINE } from "@/lib/site-copy";

const headline = {
  maxWidth: OG_TEXT_BOX.width,
  maxHeight: OG_HEADLINE_TYPE.maxHeight,
  lineHeight: OG_HEADLINE_TYPE.lineHeight,
  sizes: OG_HEADLINE_TYPE.sizes,
  letterSpacingEm: OG_HEADLINE_TYPE.letterSpacingEm,
};

describe("estimateLineCount", () => {
  it("should return 0 when the text is blank", () => {
    expect(estimateLineCount("   ", 64, 540)).toBe(0);
  });

  it("should keep a short phrase on one line when it fits", () => {
    expect(estimateLineCount("artifacts", 64, 540)).toBe(1);
  });

  it("should wrap at word breaks when a line runs out of room", () => {
    expect(estimateLineCount("one two three four five six seven eight nine ten", 64, 540)).toBeGreaterThan(1);
  });

  it("should split a word longer than the box across lines", () => {
    expect(estimateLineCount("x".repeat(60), 64, 540)).toBeGreaterThanOrEqual(2);
  });
});

describe("fitText", () => {
  it("should keep the current headline at 64px in at most three lines", () => {
    expect(fitText(OG_HEADLINE, headline)).toEqual({ fontSize: 64, maxLines: 3, clamped: false });
  });

  it("should scale a 90-character headline down so it fits the height budget", () => {
    const long = "Share what your coding agents make with the people who need to read it, then act on it now";
    expect(long).toHaveLength(90);
    const fitted = fitText(long, headline);
    expect(fitted.fontSize).toBeLessThan(64);
    expect(fitted.clamped).toBe(false);
    const lines = estimateLineCount(long, fitted.fontSize, headline.maxWidth, headline.letterSpacingEm);
    expect(lines * fitted.fontSize * headline.lineHeight).toBeLessThanOrEqual(headline.maxHeight);
  });

  it("should use the smallest size and clamp when nothing fits", () => {
    expect(fitText("word ".repeat(80), headline)).toEqual({ fontSize: 42, maxLines: 5, clamped: true });
  });
});
