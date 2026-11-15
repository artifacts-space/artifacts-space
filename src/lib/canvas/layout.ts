import { canvasLimits } from "./limits";

/** What placing a frame needs: its width and, when the author gave one, its position. */
export interface FrameToPlace {
  width: number;
  position: { x: number; y: number } | null;
}

/** A frame's top-left corner on the board, in CSS pixels. */
export interface FramePosition {
  x: number;
  y: number;
}

/**
 * Where each frame sits on the board, in the order given, each as a new
 * object the caller may change. A frame with a position keeps it. The others form one row, left to right in the order
 * given with `autoGap` between them: from the board's origin, or to the right
 * of the placed frames (level with the highest one) when some have positions.
 */
export function placeFrames(frames: readonly FrameToPlace[]): FramePosition[] {
  const placed = frames.flatMap((frame) => (frame.position ? [{ ...frame.position, width: frame.width }] : []));
  let x = placed.length > 0 ? Math.max(...placed.map((frame) => frame.x + frame.width)) + canvasLimits.autoGap : 0;
  const y = placed.length > 0 ? Math.min(...placed.map((frame) => frame.y)) : 0;
  return frames.map((frame) => {
    if (frame.position) return { ...frame.position };
    const position = { x, y };
    x += frame.width + canvasLimits.autoGap;
    return position;
  });
}
