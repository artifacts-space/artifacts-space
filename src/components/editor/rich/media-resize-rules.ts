import { clampMediaWidth, mediaWidthRange } from "@/lib/files/media-rules";

/*
 * How dragging a handle of an image or a video sets its width, as a share
 * of the text column (the `width=<percent>` the dialect stores). Pure, so
 * it is tested without a browser; media-resize.tsx draws the handles.
 *
 * The block stays against the left of the column, so a handle on the
 * right widens it as the pointer moves right, and one on the left widens
 * it as the pointer moves left. A corner also follows the pointer up and
 * down, at the block's own shape, and takes whichever of the two moves it
 * further.
 */

/** The six handles: the two edges and the four corners. */
export const resizeHandles = ["left", "right", "top-left", "top-right", "bottom-left", "bottom-right"] as const;

/** One handle of a block. */
export type ResizeHandle = (typeof resizeHandles)[number];

/** Where a drag began: the block's drawn size, the text column's width, and the pointer, all in CSS pixels. */
export interface ResizeStart {
  width: number;
  height: number;
  column: number;
  x: number;
  y: number;
}

/** +1 when moving the pointer right widens the block, -1 when moving it left does. */
function sideways(handle: ResizeHandle): 1 | -1 {
  return handle.endsWith("left") ? -1 : 1;
}

/** +1 when moving the pointer down widens the block, -1 when moving it up does, 0 for an edge. */
function upright(handle: ResizeHandle): 1 | -1 | 0 {
  if (handle.startsWith("top")) return -1;
  return handle.startsWith("bottom") ? 1 : 0;
}

/** How many pixels wider the block is with the pointer at `point`. */
function widened(handle: ResizeHandle, start: ResizeStart, point: { x: number; y: number }): number {
  const across = (point.x - start.x) * sideways(handle);
  if (upright(handle) === 0 || start.height <= 0) return across;
  const down = (point.y - start.y) * upright(handle) * (start.width / start.height);
  return Math.abs(down) > Math.abs(across) ? down : across;
}

/** The width, in whole percent of the text column, of a block dragged by `handle` from `start` to `point`. */
export function resizedWidth(handle: ResizeHandle, start: ResizeStart, point: { x: number; y: number }): number {
  if (start.column <= 0) return mediaWidthRange.max;
  return clampMediaWidth(((start.width + widened(handle, start, point)) / start.column) * 100);
}

/** How far one press of an arrow key moves an edge, in percent of the text column. */
export const resizeKeyStep = 5;

/**
 * The width after a key pressed on an edge handle, or null for a key that
 * does not resize. An arrow moves the edge the way it points, so Right
 * widens from the right edge and narrows from the left. Home is the
 * narrowest, End the full column.
 */
export function keyedWidth(handle: "left" | "right", current: number, key: string): number | null {
  if (key === "Home") return mediaWidthRange.min;
  if (key === "End") return mediaWidthRange.max;
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;
  const toward = key === "ArrowRight" ? 1 : -1;
  return clampMediaWidth(current + toward * sideways(handle) * resizeKeyStep);
}
