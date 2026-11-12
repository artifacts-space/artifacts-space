import { describe, expect, it } from "vitest";

import { pageColumnClass } from "@/lib/page-width/rules";

import { choosePlacement, gripInset, gripMenuRule, menuEdge, menuWidth, pointMenuRule, submenuRule, submenuWidth } from "./menu-placement";

describe("choosePlacement", () => {
  it("should open the grip's menu to the left of the grip when it fits there", () => {
    const left = gripMenuRule.gap + menuEdge + menuWidth;
    expect(choosePlacement(gripMenuRule, { left, right: left + 22 }, menuWidth, 1280)).toBe("left");
  });

  it("should open the grip's menu to the right of the grip when the left is a pixel short", () => {
    const left = gripMenuRule.gap + menuEdge + menuWidth - 1;
    expect(choosePlacement(gripMenuRule, { left, right: left + 22 }, menuWidth, 1280)).toBe("right");
  });

  it("should use the rule's last side, never above or below, when no side has room", () => {
    const cramped = { left: 100, right: 300 };
    expect(choosePlacement(gripMenuRule, cramped, 400, 400)).toBe("right");
    expect(choosePlacement(submenuRule, cramped, 400, 400)).toBe("left-start");
    expect(choosePlacement(pointMenuRule, cramped, 400, 400)).toBe("left-start");
  });

  it("should fit on the left from a 1588px page area with the contained page column, as AGENTS.md says", () => {
    // The contained column is max-w-5xl (1024px) with px-6 (24px); the grip sits gripInset left of the block.
    // Widths here are the page area (clientWidth): the window minus any classic scrollbar.
    expect(pageColumnClass(false)).toBe("max-w-5xl px-6");
    const gripAt = (windowWidth: number) => {
      const left = (windowWidth - 1024) / 2 + 24 - gripInset;
      return { left, right: left + 22 };
    };
    expect(choosePlacement(gripMenuRule, gripAt(1588), menuWidth, 1588)).toBe("left");
    expect(choosePlacement(gripMenuRule, gripAt(1587), menuWidth, 1587)).toBe("right");
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
