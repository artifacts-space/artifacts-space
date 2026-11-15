import { readCanvas } from "./read";

/** One line of a canvas's outline: a frame's name and size. */
export interface CanvasOutlineFrame {
  name: string;
  width: number;
  height: number | null;
}

/** The frames of a canvas, in order, for summaries and previews. Null when the canvas cannot be read. */
export function canvasOutline(content: string): CanvasOutlineFrame[] | null {
  const read = readCanvas(content);
  if (!read.renderable) return null;
  return read.frames.map((frame) => ({ name: frame.name, width: frame.width, height: frame.height }));
}

/** "3 frames", "1 frame". */
export function frameCountLabel(count: number): string {
  return `${String(count)} ${count === 1 ? "frame" : "frames"}`;
}

/** A one-line description of a canvas: how many frames it has and their names. Empty when it has none or cannot be read. */
export function canvasExcerpt(content: string): string {
  const frames = canvasOutline(content);
  if (!frames || frames.length === 0) return "";
  return `${frameCountLabel(frames.length)}: ${frames.map((frame) => frame.name).join("; ")}`;
}
