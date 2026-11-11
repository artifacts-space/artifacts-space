import type { Placement } from "@floating-ui/dom";

/*
 * Where the block menu and its submenus open. Each has one side it prefers
 * and one fixed fallback for when that side has no room. The menu never
 * flips above or below because it runs out of height: it slides up or down
 * to stay on screen instead, so it always opens the same way.
 */

/** The space between a menu and what it opens from. */
export const menuGap = 6;

/** How close a menu may come to the edge of the window. */
export const menuEdge = 8;

/** The room the menu keeps below the block when it opens beneath it. */
export const fallbackRoom = 240;

/** A box in window coordinates. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A menu's preferred side, top-aligned with what it opens from, and where it goes when that side has no room. */
export interface PlacementRule {
  preferred: "left-start" | "right-start";
  fallback: Placement;
}

/**
 * The block menu from its grip, and a submenu from its row: to the left,
 * top-aligned, or below, aligned to its left edge, when the left has no
 * room. Below the handle means below the whole block (handleBox), and a submenu
 * below its row stays over the menu, so neither covers the handle, nor the
 * block unless it runs past the bottom of the window.
 */
export const besideRule: PlacementRule = { preferred: "left-start", fallback: "bottom-start" };

/** The width of a submenu beside the menu: set on the panel (block-menu.tsx) and known before it opens, for the hover check below. */
export const submenuWidth = 260;

/**
 * True when a submenu opened from `row` would go beside it, to the left.
 * Only then does hovering the row open it: a submenu below its row covers
 * the rows under it, so passing over the row on the way down must not open
 * it. A click, Enter, or → still does.
 */
export function submenuOpensBeside(row: Pick<DOMRect, "left" | "right">, viewportWidth: number): boolean {
  return choosePlacement(besideRule, row, submenuWidth, viewportWidth) === besideRule.preferred;
}

/** The block menu from a right-click: to the right of the pointer, or to its left near the right edge. */
export const pointMenuRule: PlacementRule = { preferred: "right-start", fallback: "left-start" };

/**
 * The placement for a menu `width` wide beside `reference` in a window
 * `viewportWidth` wide: the preferred side when the menu fits there whole,
 * otherwise the fallback.
 */
export function choosePlacement(rule: PlacementRule, reference: Pick<DOMRect, "left" | "right">, width: number, viewportWidth: number): Placement {
  const room = rule.preferred === "left-start" ? reference.left - menuGap - menuEdge : viewportWidth - reference.right - menuGap - menuEdge;
  return room >= width ? rule.preferred : rule.fallback;
}

/**
 * What the block menu opens against when it opens from a grip: the left and
 * right edges of the whole handle ("+" and the grip), the block's top (so a
 * menu beside it is top-aligned with the block, not the handle), and the
 * block's bottom (so a menu below it never covers the block). When the
 * block runs too far down the window to leave `fallbackRoom` beneath it, the
 * bottom rises to make that room, but never above the handle.
 */
export function handleBox(handle: Box, block: Box | null, viewportHeight: number): Box {
  if (!block || block.bottom <= block.top) return handle;
  const lowest = viewportHeight - menuEdge - menuGap - fallbackRoom;
  return { left: handle.left, right: handle.right, top: block.top, bottom: Math.max(handle.bottom, Math.min(block.bottom, lowest)) };
}
