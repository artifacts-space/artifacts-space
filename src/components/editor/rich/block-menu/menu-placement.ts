import type { Placement } from "@floating-ui/dom";

/*
 * Where the block menu and its submenus open. Each has the sides it tries,
 * in order, and the last one is used when none has room. Menus are placed
 * against the window, never flip above or below, and slide up or down to
 * stay `menuEdge` inside the window instead.
 */

/** How close a menu may come to the edge of the window. */
export const menuEdge = 12;

/** The block menu's width (set on its panel in block-menu.tsx): its widest row, "Copy link to block" with Alt+Shift+L, fits whole. */
export const menuWidth = 265;

/** A submenu's width (Change, Color; set on its panel). */
export const submenuWidth = 220;

/** The shortest a menu gets when the window is short: its search and a few rows. */
export const menuMinHeight = 160;

/** The tallest a menu gets in a tall window, so a long submenu scrolls instead of running down the page. */
export const menuMaxHeight = 560;

/** How far a submenu overlaps the menu it opens from. */
export const submenuOverlap = 4;

/** How far a row sits inside the menu's edge (the panel's `p-1.5`). */
const rowInset = 6;

/** The sides a menu tries, in order, and its distance from what it opens from (negative overlaps it). */
export interface PlacementRule {
  sides: readonly [Placement, ...Placement[]];
  gap: number;
}

/**
 * The block menu from its grip: to the left of the grip, or to its right
 * (over the block's text) when the left has no room. Centered on the grip,
 * then kept inside the window.
 */
export const gripMenuRule: PlacementRule = { sides: ["left", "right"], gap: 5 };

/**
 * A submenu (Change, Color) from its row: to the right of the menu,
 * overlapping it by `submenuOverlap`, or to its left when the right has no
 * room. Top-aligned with the row.
 */
export const submenuRule: PlacementRule = { sides: ["right-start", "left-start"], gap: rowInset - submenuOverlap };

/** The block menu from a right-click: at the pointer, to its right, or to its left near the right edge. */
export const pointMenuRule: PlacementRule = { sides: ["right-start", "left-start"], gap: 2 };

/** The room beside `reference` on a side, inside the window's edge. */
function roomOn(side: Placement, reference: Pick<DOMRect, "left" | "right">, gap: number, viewportWidth: number): number {
  return side.startsWith("left") ? reference.left - gap - menuEdge : viewportWidth - reference.right - gap - menuEdge;
}

/**
 * The placement for a menu `width` wide beside `reference` in a window
 * `viewportWidth` wide: the first of the rule's sides where it fits whole,
 * otherwise the last.
 */
export function choosePlacement(rule: PlacementRule, reference: Pick<DOMRect, "left" | "right">, width: number, viewportWidth: number): Placement {
  return rule.sides.find((side) => roomOn(side, reference, rule.gap, viewportWidth) >= width) ?? rule.sides[rule.sides.length - 1] ?? rule.sides[0];
}
