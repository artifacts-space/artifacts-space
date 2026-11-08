import { describe, expect, it } from "vitest";

import { dotMatrix } from "./dot-matrix";

describe("dotMatrix", () => {
  it("should light exactly the font's cells when the word is MIT", () => {
    const lit = dotMatrix("MIT", 40, 13).filter((dot) => dot.lit);
    // M has 18 cells, I has 11, T has 11.
    expect(lit).toHaveLength(40);
  });

  it("should centre the word when the field is wider than the word", () => {
    const lit = dotMatrix("MIT", 41, 13).filter((dot) => dot.lit);
    const xs = lit.map((dot) => dot.x);
    const ys = lit.map((dot) => dot.y);
    expect(Math.min(...xs)).toBe(41 - 1 - Math.max(...xs));
    expect(Math.min(...ys)).toBe(3);
    expect(Math.max(...ys)).toBe(9);
  });

  it("should draw the same field when it renders twice", () => {
    expect(dotMatrix("MIT", 30, 11)).toEqual(dotMatrix("MIT", 30, 11));
  });

  it("should skip letters the font lacks when the word has them", () => {
    expect(dotMatrix("M?", 20, 9).filter((dot) => dot.lit)).toHaveLength(18);
  });
});
