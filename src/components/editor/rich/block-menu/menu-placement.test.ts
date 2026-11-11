import { describe, expect, it } from "vitest";

import { besideRule, choosePlacement, fallbackRoom, handleBox, menuEdge, menuGap, pointMenuRule, submenuOpensBeside, submenuWidth } from "./menu-placement";

describe("choosePlacement", () => {
  it("should open a menu to the left of its anchor when it fits there", () => {
    expect(choosePlacement(besideRule, { left: 400, right: 420 }, 300, 1400)).toBe("left-start");
  });

  it("should open a menu below its anchor when the left side is too narrow", () => {
    expect(choosePlacement(besideRule, { left: 200, right: 220 }, 300, 900)).toBe("bottom-start");
  });

  it("should never choose above or below for room in height, whatever the window's height", () => {
    for (const rule of [besideRule, pointMenuRule]) {
      expect(choosePlacement(rule, { left: 600, right: 620 }, 300, 1400)).toMatch(/^(left|right)-start$/);
    }
  });

  it("should open a right-click menu to the left of the pointer near the right edge", () => {
    expect(choosePlacement(pointMenuRule, { left: 1300, right: 1300 }, 300, 1400)).toBe("left-start");
    expect(choosePlacement(pointMenuRule, { left: 500, right: 500 }, 300, 1400)).toBe("right-start");
  });

  it("should need room for the whole menu and the gaps before choosing the left", () => {
    const fits = menuGap + menuEdge + 300;
    expect(choosePlacement(besideRule, { left: fits, right: fits + 20 }, 300, 1400)).toBe("left-start");
    expect(choosePlacement(besideRule, { left: fits - 1, right: fits + 19 }, 300, 1400)).toBe("bottom-start");
  });
});

describe("handleBox", () => {
  const handle = { left: 300, right: 320, top: 104, bottom: 128 };

  it("should take the handle's edges and the block's top and bottom when the block has room below it", () => {
    expect(handleBox(handle, { left: 340, right: 1000, top: 100, bottom: 220 }, 900)).toEqual({ left: 300, right: 320, top: 100, bottom: 220 });
  });

  it("should raise the bottom to leave room for the menu when the block runs down the window", () => {
    const box = handleBox(handle, { left: 340, right: 1000, top: 100, bottom: 2000 }, 900);
    expect(box.bottom).toBe(900 - menuEdge - menuGap - fallbackRoom);
  });

  it("should never raise the bottom above the handle", () => {
    const low = { left: 300, right: 320, top: 804, bottom: 828 };
    expect(handleBox(low, { left: 340, right: 1000, top: 800, bottom: 2000 }, 900).bottom).toBe(828);
  });

  it("should use the handle alone when the block has no box", () => {
    expect(handleBox(handle, null, 900)).toEqual(handle);
    expect(handleBox(handle, { left: 0, right: 0, top: 0, bottom: 0 }, 900)).toEqual(handle);
  });
});

describe("submenuOpensBeside", () => {
  it("should be true when the submenu fits to the left of its row", () => {
    const left = menuGap + menuEdge + submenuWidth;
    expect(submenuOpensBeside({ left, right: left + 288 }, 2400)).toBe(true);
  });

  it("should be false when the submenu would open below its row", () => {
    const left = menuGap + menuEdge + submenuWidth - 1;
    expect(submenuOpensBeside({ left, right: left + 288 }, 2400)).toBe(false);
  });
});
