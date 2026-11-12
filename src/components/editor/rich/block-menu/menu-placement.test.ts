import { describe, expect, it } from "vitest";

import { choosePlacement, gripMenuRule, menuEdge, menuWidth, pointMenuRule, submenuRule, submenuWidth } from "./menu-placement";

describe("choosePlacement", () => {
  it("should open the grip's menu to the left of the grip when it fits there", () => {
    const left = gripMenuRule.gap + menuEdge + menuWidth;
    expect(choosePlacement(gripMenuRule, { left, right: left + 22 }, menuWidth, 1280)).toBe("left");
  });

  it("should open the grip's menu to the right of the grip when the left is a pixel short", () => {
    const left = gripMenuRule.gap + menuEdge + menuWidth - 1;
    expect(choosePlacement(gripMenuRule, { left, right: left + 22 }, menuWidth, 1280)).toBe("right");
  });

  it("should never choose above or below, even when no side has room", () => {
    for (const rule of [gripMenuRule, submenuRule, pointMenuRule]) {
      expect(choosePlacement(rule, { left: 100, right: 300 }, 400, 400)).toMatch(/^(left|right)/);
    }
  });

  it("should open a submenu to the right of its row, or to its left near the right edge", () => {
    expect(choosePlacement(submenuRule, { left: 400, right: 653 }, submenuWidth, 1400)).toBe("right-start");
    expect(choosePlacement(submenuRule, { left: 900, right: 1153 }, submenuWidth, 1300)).toBe("left-start");
  });

  it("should open a right-click menu to the right of the pointer, or to its left near the right edge", () => {
    expect(choosePlacement(pointMenuRule, { left: 500, right: 500 }, menuWidth, 1400)).toBe("right-start");
    expect(choosePlacement(pointMenuRule, { left: 1300, right: 1300 }, menuWidth, 1400)).toBe("left-start");
  });
});
