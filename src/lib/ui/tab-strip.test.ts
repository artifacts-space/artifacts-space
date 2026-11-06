import { describe, expect, it } from "vitest";

import { revealScrollLeft, stripFades } from "./tab-strip";

describe("stripFades", () => {
  it("should show no fade when every tab fits", () => {
    expect(stripFades({ scrollLeft: 0, clientWidth: 600, scrollWidth: 600 })).toEqual({ start: false, end: false });
  });

  it("should fade only the end when the row is scrolled to its start", () => {
    expect(stripFades({ scrollLeft: 0, clientWidth: 300, scrollWidth: 700 })).toEqual({ start: false, end: true });
  });

  it("should fade both edges when the row is scrolled to the middle", () => {
    expect(stripFades({ scrollLeft: 120, clientWidth: 300, scrollWidth: 700 })).toEqual({ start: true, end: true });
  });

  it("should fade only the start when the row is scrolled to its end, allowing sub-pixel rounding", () => {
    expect(stripFades({ scrollLeft: 399.5, clientWidth: 300, scrollWidth: 700 })).toEqual({ start: true, end: false });
  });
});

describe("revealScrollLeft", () => {
  const metrics = { scrollLeft: 100, clientWidth: 300, scrollWidth: 900 };

  it("should not scroll when the tab is clear of both fades", () => {
    expect(revealScrollLeft({ start: 150, end: 250 }, metrics)).toBeNull();
  });

  it("should scroll right so the tab clears the end fade when it sits past the right edge", () => {
    expect(revealScrollLeft({ start: 380, end: 460 }, metrics)).toBe(460 + 32 - 300);
  });

  it("should scroll left so the tab clears the start fade when it sits under the left edge", () => {
    expect(revealScrollLeft({ start: 110, end: 190 }, metrics)).toBe(110 - 32);
  });

  it("should stop at the row's ends when the fade would push past them", () => {
    expect(revealScrollLeft({ start: 10, end: 80 }, metrics)).toBe(0);
    expect(revealScrollLeft({ start: 820, end: 890 }, metrics)).toBe(600);
  });

  it("should not scroll when the row is already at the end it would scroll to", () => {
    expect(revealScrollLeft({ start: 0, end: 60 }, { scrollLeft: 0, clientWidth: 300, scrollWidth: 900 })).toBeNull();
  });
});
