import { describe, expect, it } from "vitest";

import { iconGridMove } from "./icon-grid";

describe("iconGridMove", () => {
  it("should move one cell when the arrow is left or right", () => {
    expect(iconGridMove(3, "ArrowRight", 8, 20)).toBe(4);
    expect(iconGridMove(3, "ArrowLeft", 8, 20)).toBe(2);
  });

  it("should move one row when the arrow is up or down", () => {
    expect(iconGridMove(3, "ArrowDown", 8, 20)).toBe(11);
    expect(iconGridMove(11, "ArrowUp", 8, 20)).toBe(3);
  });

  it("should stay put when a move would leave the grid", () => {
    expect(iconGridMove(0, "ArrowLeft", 8, 20)).toBe(0);
    expect(iconGridMove(19, "ArrowRight", 8, 20)).toBe(19);
    expect(iconGridMove(15, "ArrowDown", 8, 20)).toBe(15);
    expect(iconGridMove(2, "ArrowUp", 8, 20)).toBe(2);
  });

  it("should jump to the ends when the key is Home or End", () => {
    expect(iconGridMove(7, "Home", 8, 20)).toBe(0);
    expect(iconGridMove(7, "End", 8, 20)).toBe(19);
  });

  it("should ignore other keys and empty grids", () => {
    expect(iconGridMove(0, "a", 8, 20)).toBeNull();
    expect(iconGridMove(0, "ArrowRight", 8, 0)).toBeNull();
  });
});
