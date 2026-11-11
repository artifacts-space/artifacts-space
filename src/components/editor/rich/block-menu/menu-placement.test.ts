import { describe, expect, it } from "vitest";

import { besideRule, choosePlacement, fallbackRoom, handleBox, menuEdge, menuGap, menuMinHeight, pointMenuRule, scrollForRoom, submenuOpensBeside, submenuWidth } from "./menu-placement";

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

  it("should not raise the bottom above the handle while a short menu still fits below it", () => {
    const low = { left: 300, right: 320, top: 676, bottom: 700 };
    expect(handleBox(low, { left: 340, right: 1000, top: 672, bottom: 2000 }, 900).bottom).toBe(700);
  });

  it("should raise the bottom past the handle only as far as a short menu needs at the very bottom of the window", () => {
    const low = { left: 300, right: 320, top: 870, bottom: 894 };
    expect(handleBox(low, { left: 340, right: 1000, top: 866, bottom: 2000 }, 900).bottom).toBe(900 - menuEdge - menuGap - menuMinHeight);
    expect(handleBox(low, null, 900).bottom).toBe(900 - menuEdge - menuGap - menuMinHeight);
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

describe("scrollForRoom", () => {
  const lowest = 768 - menuEdge - menuGap - fallbackRoom;

  it("should scroll the block's bottom up, in whole pixels, to leave room for the menu below it when the left has no room", () => {
    const handle = { left: 40, right: 86, top: 700, bottom: 724 };
    expect(scrollForRoom(handle, { left: 90, right: 900, top: 698, bottom: 726.5 }, 300, 1024, 768)).toBe(Math.ceil(726.5 - lowest));
  });

  it("should never scroll the handle past the top of the window for a tall block", () => {
    const handle = { left: 40, right: 86, top: 300, bottom: 324 };
    expect(scrollForRoom(handle, { left: 90, right: 900, top: 298, bottom: 2000 }, 300, 1024, 768)).toBe(300 - menuEdge);
  });

  it("should not scroll when the block already has room below it", () => {
    expect(scrollForRoom({ left: 40, right: 86, top: 200, bottom: 224 }, { left: 90, right: 900, top: 198, bottom: 226 }, 300, 1024, 768)).toBe(0);
  });

  it("should not scroll when the menu opens beside the handle", () => {
    expect(scrollForRoom({ left: 500, right: 546, top: 700, bottom: 724 }, null, 300, 1920, 768)).toBe(0);
  });
});
