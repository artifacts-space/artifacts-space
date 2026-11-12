import { describe, expect, it } from "vitest";

import type { MenuContext } from "./block-actions";
import { menuReducer, openedMenu, rowsFor, type MenuEvent, type MenuState } from "./block-menu-state";

const context: MenuContext = { changeable: true, currentType: "text", colorable: true, colors: { color: null, background: null }, canMoveUp: false, canMoveDown: true, canLink: true, canComment: true };

function after(...events: MenuEvent[]): MenuState {
  return events.reduce((state, event) => menuReducer(state, event, context), openedMenu);
}

describe("menuReducer", () => {
  it("should highlight nothing when the menu opens", () => {
    expect(openedMenu.active).toBe(-1);
    expect(openedMenu.submenu).toBeNull();
  });

  it("should highlight the first match when text is typed, so Enter runs it", () => {
    const state = after({ type: "typed", query: "dele" });
    expect(rowsFor(state, context)[state.active]?.label).toBe("Delete");
  });

  it("should highlight nothing again when the search is cleared", () => {
    expect(after({ type: "typed", query: "dup" }, { type: "typed", query: "" }).active).toBe(-1);
  });

  it("should start at the first row on ArrowDown and the last on ArrowUp", () => {
    expect(after({ type: "arrow", direction: 1 }).active).toBe(0);
    expect(rowsFor(openedMenu, context)[after({ type: "arrow", direction: -1 }).active]?.label).toBe("Comment");
  });

  it("should skip a disabled row with the arrow keys", () => {
    const down = { type: "arrow", direction: 1 } as const;
    const state = after(down, down, down, down, down);
    expect(rowsFor(state, context)[state.active]?.label).toBe("Move down");
  });

  it("should highlight the row under the pointer when hovering", () => {
    expect(after({ type: "hover", index: 2 }).active).toBe(2);
  });

  it("should open and close a submenu, and close it when the search changes", () => {
    const open = after({ type: "openSubmenu", id: "change", focused: true });
    expect(open.submenu).toEqual({ id: "change", focused: true });
    expect(menuReducer(open, { type: "closeSubmenu" }, context).submenu).toBeNull();
    expect(menuReducer(open, { type: "typed", query: "h" }, context).submenu).toBeNull();
  });
});
