import { describe, expect, it } from "vitest";

import { clampCell, keyToMove, moveCell } from "./grid-navigation";

const bounds = { rows: 3, columns: 2 };

describe("keyToMove", () => {
  it("should map arrows, Tab, Home, and End when pressed", () => {
    expect(keyToMove("ArrowDown", { shift: false, ctrl: false })).toBe("down");
    expect(keyToMove("Tab", { shift: true, ctrl: false })).toBe("previous");
    expect(keyToMove("Home", { shift: false, ctrl: true })).toBe("gridStart");
    expect(keyToMove("End", { shift: false, ctrl: false })).toBe("rowEnd");
  });

  it("should return null when the key does not move", () => {
    expect(keyToMove("a", { shift: false, ctrl: false })).toBeNull();
  });
});

describe("moveCell", () => {
  it("should stop at the edges when an arrow points out of the grid", () => {
    expect(moveCell({ row: -1, column: 0 }, "up", bounds)).toEqual({ row: -1, column: 0 });
    expect(moveCell({ row: 2, column: 1 }, "right", bounds)).toEqual({ row: 2, column: 1 });
    expect(moveCell({ row: 2, column: 1 }, "down", bounds)).toEqual({ row: 2, column: 1 });
  });

  it("should move from the header into the first row when pressing down", () => {
    expect(moveCell({ row: -1, column: 1 }, "down", bounds)).toEqual({ row: 0, column: 1 });
  });

  it("should wrap to the next row when Tab is pressed in the last column", () => {
    expect(moveCell({ row: 0, column: 1 }, "next", bounds)).toEqual({ row: 1, column: 0 });
    expect(moveCell({ row: 1, column: 0 }, "previous", bounds)).toEqual({ row: 0, column: 1 });
  });

  it("should return null when Tab leaves the last cell or Shift+Tab the first", () => {
    expect(moveCell({ row: 2, column: 1 }, "next", bounds)).toBeNull();
    expect(moveCell({ row: -1, column: 0 }, "previous", bounds)).toBeNull();
  });

  it("should jump by a page and to the corners when asked", () => {
    expect(moveCell({ row: 0, column: 0 }, "pageDown", { rows: 30, columns: 2 })).toEqual({ row: 10, column: 0 });
    expect(moveCell({ row: 20, column: 0 }, "pageUp", { rows: 30, columns: 2, page: 17 })).toEqual({ row: 3, column: 0 });
    expect(moveCell({ row: 1, column: 1 }, "gridStart", bounds)).toEqual({ row: -1, column: 0 });
    expect(moveCell({ row: 0, column: 0 }, "gridEnd", bounds)).toEqual({ row: 2, column: 1 });
  });

  it("should return null when the grid has no columns", () => {
    expect(moveCell({ row: 0, column: 0 }, "down", { rows: 0, columns: 0 })).toBeNull();
  });
});

describe("clampCell", () => {
  it("should pull a cell back inside when rows and columns were removed", () => {
    expect(clampCell({ row: 9, column: 9 }, bounds)).toEqual({ row: 2, column: 1 });
    expect(clampCell({ row: 4, column: 0 }, { rows: 0, columns: 1 })).toEqual({ row: -1, column: 0 });
  });
});
