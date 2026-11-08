import { describe, expect, it } from "vitest";

import { positionAfterDrag, positionAfterKey } from "./reposition";

describe("positionAfterKey", () => {
  it("should move one point per arrow press and ten with Shift", () => {
    expect(positionAfterKey(50, "ArrowUp", false)).toBe(49);
    expect(positionAfterKey(50, "ArrowDown", false)).toBe(51);
    expect(positionAfterKey(50, "ArrowDown", true)).toBe(60);
    expect(positionAfterKey(50, "PageUp", false)).toBe(40);
  });

  it("should stop at the top and bottom when a step would pass them", () => {
    expect(positionAfterKey(3, "ArrowUp", true)).toBe(0);
    expect(positionAfterKey(97, "PageDown", false)).toBe(100);
    expect(positionAfterKey(40, "Home", false)).toBe(0);
    expect(positionAfterKey(40, "End", false)).toBe(100);
  });

  it("should ignore keys that do not move the image when they are pressed", () => {
    expect(positionAfterKey(50, "ArrowLeft", false)).toBeNull();
    expect(positionAfterKey(50, "a", false)).toBeNull();
  });
});

describe("positionAfterDrag", () => {
  // A 1000×1000 image in a 1000×200 banner overflows by 800 px.
  const frame = { frameWidth: 1000, frameHeight: 200, naturalWidth: 1000, naturalHeight: 1000 };

  it("should show more of the top when the image is dragged down", () => {
    expect(positionAfterDrag(50, 80, frame)).toBe(40);
    expect(positionAfterDrag(50, -80, frame)).toBe(60);
  });

  it("should stay within 0 to 100 when the drag goes past an edge", () => {
    expect(positionAfterDrag(10, 2000, frame)).toBe(0);
    expect(positionAfterDrag(90, -2000, frame)).toBe(100);
  });

  it("should not move when the image is no taller than the banner", () => {
    expect(positionAfterDrag(30, 100, { ...frame, naturalHeight: 150 })).toBe(30);
    expect(positionAfterDrag(30, 100, { ...frame, naturalWidth: 0 })).toBe(30);
  });
});
