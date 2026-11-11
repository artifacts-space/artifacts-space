import { firstRunnable, nextRunnable, searchMenu, type BlockSubmenuId, type MenuContext, type MenuEntry } from "./block-actions";

/*
 * The block menu's state, kept pure so it is tested without a browser
 * (block-menu-state.test.ts). Nothing is highlighted when the menu opens:
 * hovering, the arrow keys, or typing highlight a row, and typing highlights
 * the first match so Enter runs it.
 */

export interface MenuState {
  query: string;
  /** The highlighted row, or -1 for none. */
  active: number;
  /** The open submenu and, when the keyboard opened it, that it has focus. */
  submenu: { id: BlockSubmenuId; focused: boolean } | null;
}

export type MenuEvent =
  | { type: "typed"; query: string }
  | { type: "arrow"; direction: 1 | -1 }
  | { type: "hover"; index: number }
  | { type: "openSubmenu"; id: BlockSubmenuId; focused: boolean }
  | { type: "closeSubmenu" };

/** The state of a menu that has just opened. */
export const openedMenu: MenuState = { query: "", active: -1, submenu: null };

/** The rows the menu shows for its query. */
export function rowsFor(state: MenuState, context: MenuContext): MenuEntry[] {
  return searchMenu(state.query, context);
}

/** The next state after an event, given the menu's context. */
export function menuReducer(state: MenuState, event: MenuEvent, context: MenuContext): MenuState {
  switch (event.type) {
    case "typed": {
      const rows = searchMenu(event.query, context);
      return { query: event.query, active: event.query.trim() ? firstRunnable(rows) : -1, submenu: null };
    }
    case "arrow":
      return { ...state, active: nextRunnable(rowsFor(state, context), state.active, event.direction), submenu: null };
    case "hover":
      return { ...state, active: event.index };
    case "openSubmenu":
      return { ...state, submenu: { id: event.id, focused: event.focused } };
    case "closeSubmenu":
      return { ...state, submenu: null };
  }
}
