import { describe, expect, it } from "vitest";

import { keyedWidth, resizedWidth, resizeHandles, type ResizeStart } from "./media-resize-rules";

/** A block half the column wide, twice as wide as it is tall, with the pointer on it. */
const start: ResizeStart = { width: 400, height: 200, column: 800, x: 500, y: 300 };

describe("resizedWidth", () => {
  it("should widen from the right edge when the pointer moves right", () => {
    expect(resizedWidth("right", start, { x: 580, y: 300 })).toBe(60);
    expect(resizedWidth("right", start, { x: 420, y: 300 })).toBe(40);
  });

  it("should widen from the left edge when the pointer moves left", () => {
    expect(resizedWidth("left", start, { x: 420, y: 300 })).toBe(60);
    expect(resizedWidth("left", start, { x: 580, y: 300 })).toBe(40);
  });

  it("should ignore up and down on an edge", () => {
    expect(resizedWidth("right", start, { x: 500, y: 900 })).toBe(50);
    expect(resizedWidth("left", start, { x: 500, y: 0 })).toBe(50);
  });

  it.each([
    ["bottom-right", { x: 500, y: 340 }, 60],
    ["bottom-left", { x: 500, y: 340 }, 60],
    ["top-right", { x: 500, y: 260 }, 60],
    ["top-left", { x: 500, y: 260 }, 60],
    ["bottom-right", { x: 500, y: 260 }, 40],
    ["top-left", { x: 500, y: 340 }, 40],
  ] as const)("should follow the pointer up and down at the block's shape from the %s corner", (handle, point, width) => {
    expect(resizedWidth(handle, start, point)).toBe(width);
  });

  it("should take the larger of the two moves at a corner", () => {
    expect(resizedWidth("bottom-right", start, { x: 660, y: 310 })).toBe(70);
    expect(resizedWidth("bottom-left", start, { x: 340, y: 310 })).toBe(70);
  });

  it.each(resizeHandles)("should stay within the allowed widths from the %s handle", (handle) => {
    for (const point of [{ x: -5000, y: -5000 }, { x: 5000, y: 5000 }]) {
      const width = resizedWidth(handle, start, point);
      expect(width).toBeGreaterThanOrEqual(10);
      expect(width).toBeLessThanOrEqual(100);
      expect(Number.isInteger(width)).toBe(true);
    }
  });

  it("should give the full column when the column has no width to measure against", () => {
    expect(resizedWidth("right", { ...start, column: 0 }, { x: 500, y: 300 })).toBe(100);
  });
});

describe("keyedWidth", () => {
  it("should move an edge the way the arrow points", () => {
    expect(keyedWidth("right", 50, "ArrowRight")).toBe(55);
    expect(keyedWidth("right", 50, "ArrowLeft")).toBe(45);
    expect(keyedWidth("left", 50, "ArrowLeft")).toBe(55);
    expect(keyedWidth("left", 50, "ArrowRight")).toBe(45);
  });

  it("should stop at the narrowest and the widest", () => {
    expect(keyedWidth("right", 98, "ArrowRight")).toBe(100);
    expect(keyedWidth("right", 12, "ArrowLeft")).toBe(10);
    expect(keyedWidth("left", 50, "Home")).toBe(10);
    expect(keyedWidth("left", 50, "End")).toBe(100);
  });

  it("should leave every other key alone", () => {
    expect(keyedWidth("right", 50, "Enter")).toBeNull();
    expect(keyedWidth("right", 50, "ArrowUp")).toBeNull();
  });
});
