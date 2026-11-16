import { frameSpecText, readCanvas, type CanvasFrameRead } from "./read";

/** What one save changed on a canvas, frame by frame. */
export interface FrameChanges {
  /** Frames that are new or look different, in the order the canvas has them now. */
  changed: { id: string; name: string }[];
  /** How many frames the canvas had before and has no longer. */
  removed: number;
}

/** Everything about a frame that a reader can see: its name, size, place, and what it draws. */
function frameKey(frame: CanvasFrameRead): string {
  return JSON.stringify([frame.name, frame.width, frame.height, frame.padding, frame.position, frameSpecText(frame)]);
}

/**
 * The frames that differ between two saves of a canvas, by frame id. A frame
 * that only moved in the order is not a change; one that moved on the board
 * is. Content that cannot be read as a canvas has no frames, so a canvas
 * that became readable reports every frame as changed.
 */
export function frameChanges(before: string, after: string): FrameChanges {
  const earlier = new Map(readCanvas(before).frames.map((frame) => [frame.id, frameKey(frame)]));
  const now = readCanvas(after).frames;
  const kept = new Set(now.map((frame) => frame.id));
  const changed = now.filter((frame) => earlier.get(frame.id) !== frameKey(frame)).map((frame) => ({ id: frame.id, name: frame.name }));
  let removed = 0;
  for (const id of earlier.keys()) if (!kept.has(id)) removed += 1;
  return { changed, removed };
}
