/**
 * How the sheet grid lets keyboard users out when Tab moves between cells.
 * Escape then Tab leaves either way, and the first Tab back the way focus
 * came in leaves too, so Shift+Tab then Tab returns where it started. The
 * grid keeps one `TabExit` and asks these rules how each key or focus event
 * changes it.
 */

/** Which way a Tab press leaves the grid instead of moving the selection. */
export interface TabExit {
  forward: boolean;
  backward: boolean;
}

export const noExit: TabExit = { forward: false, backward: false };
export const anyExit: TabExit = { forward: true, backward: true };

/**
 * Where a focus event on the grid came from.
 *
 * - `pointer`: a click or tap into the grid.
 * - `before` or `after`: another element on that side of the grid, so a
 *   Tab from it, or a Shift+Tab, came in.
 * - `inside`: a cell editor or header inside the grid, or nowhere at all
 *   (a script, or the window coming back).
 * - `replay`: not a focus move at all. React queues a `focusin` that lands
 *   on a subtree it has not hydrated yet and dispatches a clone of it after
 *   hydration; the clone can arrive long after any key pressed since.
 */
export type FocusOrigin = "pointer" | "before" | "after" | "inside" | "replay";

/** A Tab press (by key and Shift) leaves the grid when the exit allows that direction. */
export function tabLeaves(exit: TabExit, key: string, shiftKey: boolean): boolean {
  if (key !== "Tab") return false;
  return shiftKey ? exit.backward : exit.forward;
}

/** The exit after a key press: Escape arms Tab in both directions, and any other key disarms it. */
export function exitAfterKey(key: string): TabExit {
  return key === "Escape" ? anyExit : noExit;
}

/**
 * The exit after focus arrives. Focus from another element lets the first
 * Tab back that way leave; a click or focus from nowhere starts fresh. A
 * replayed focus is stale, so it changes nothing: an Escape pressed before
 * the replay still lets the next Tab leave.
 */
export function exitAfterFocus(current: TabExit, origin: FocusOrigin): TabExit {
  switch (origin) {
    case "replay":
      return current;
    case "before":
      return { forward: false, backward: true };
    case "after":
      return { forward: true, backward: false };
    default:
      return noExit;
  }
}
