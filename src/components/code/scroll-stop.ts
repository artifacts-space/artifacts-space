/*
 * A box that scrolls (a code block, a table's frame, a board) must be
 * reachable by keyboard, or its hidden part cannot be scrolled into view
 * without a pointer. While it scrolls it is a tab stop with a name, so
 * screen readers say what got focus. It is a group, not a region: a region
 * is a landmark, and a page with ten shell commands or two tables with the
 * same caption would list ten, or two, landmarks with one name. A group
 * is announced on focus but stays out of the landmark list.
 */

/** How a scrolling box is named: by its own words, or by an element that already shows them, such as a caption. */
export type ScrollStopName = { label: string } | { labelledBy: string };

/** The attributes a scrolling box takes: a named, focusable group while it scrolls, and none while it fits. */
export type ScrollStopProps =
  | Record<string, never>
  | { tabIndex: 0; role: "group"; "aria-label": string }
  | { tabIndex: 0; role: "group"; "aria-labelledby": string };

/**
 * The attributes for a box that may scroll: a named, focusable group while
 * `scrollable` is true, and nothing while its content fits, so a box that
 * does not scroll is no extra tab stop.
 */
export function scrollStopProps(scrollable: boolean, name: ScrollStopName): ScrollStopProps {
  if (!scrollable) return {};
  if ("labelledBy" in name) return { tabIndex: 0, role: "group", "aria-labelledby": name.labelledBy };
  return { tabIndex: 0, role: "group", "aria-label": name.label };
}
