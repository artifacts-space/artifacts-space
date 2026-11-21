/**
 * Pure rules for the canvas board: how far it zooms, how "Fit" frames the
 * board, and how zooming and panning move it. The viewer keeps the state;
 * these decide the numbers, so they are tested without a browser.
 */

/** Where the board sits in its window: its scale, and the window position of the board's origin in CSS pixels. */
export interface BoardView {
  zoom: number;
  x: number;
  y: number;
}

/** A rectangle on the board, or the window's own size. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A width and height in CSS pixels. */
export interface Size {
  width: number;
  height: number;
}

/** The smallest and largest zoom. Small enough to see 24 desktop frames in one row, large enough to read a phone frame closely. */
export const zoomRange = { min: 0.02, max: 2 } as const;

/** The stops the zoom buttons move between. */
export const zoomSteps = [0.02, 0.05, 0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2] as const;

/** Space kept around the board when it is fitted to the window. */
export const fitPadding = 40;

/**
 * Below this column width frames stack in the page instead of sitting on a
 * pannable board. The viewer applies it in CSS (a container query on the
 * column, written as this number of pixels), so the page is laid out the same
 * before and after its scripts run.
 */
export const stackBelowWidth = 640;

/** How much of the board must stay inside the window when it is dragged, so it cannot be lost. */
const keepInView = 80;

/** The zoom kept inside `zoomRange`. */
export function clampZoom(zoom: number): number {
  return Math.min(zoomRange.max, Math.max(zoomRange.min, zoom));
}

/** The smallest box that holds every box given, or null when there are none. */
export function boundsOf(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * The view that shows all of `bounds` in the window: as large as fits inside
 * the padding, never above 100%, centered across, and top-aligned when the
 * board is shorter than the window so the frame names stay in view.
 */
export function fitView(bounds: Box | null, window: Size, padding = fitPadding): BoardView {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return { zoom: 1, x: padding, y: padding };
  const room = { width: Math.max(1, window.width - padding * 2), height: Math.max(1, window.height - padding * 2) };
  const zoom = clampZoom(Math.min(1, room.width / bounds.width, room.height / bounds.height));
  const x = (window.width - bounds.width * zoom) / 2 - bounds.x * zoom;
  const y = Math.max(padding, (window.height - bounds.height * zoom) / 2) - bounds.y * zoom;
  return { zoom, x, y };
}

/** The view that shows one frame: its full width in the window (never above 100%), with its top near the window's top. */
export function frameView(frame: Box, window: Size, padding = fitPadding): BoardView {
  const zoom = clampZoom(Math.min(1, Math.max(1, window.width - padding * 2) / frame.width));
  return { zoom, x: (window.width - frame.width * zoom) / 2 - frame.x * zoom, y: padding - frame.y * zoom };
}

/** The view after zooming to `zoom` while the board point under `point` (in window pixels) stays where it is. */
export function zoomAbout(view: BoardView, point: { x: number; y: number }, zoom: number): BoardView {
  const next = clampZoom(zoom);
  const ratio = next / view.zoom;
  return { zoom: next, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio };
}

/**
 * The next stop up (`direction` 1) or down (-1) from `zoom`, or the end of
 * the range. It steps from the zoom as shown, a whole percent, so a press
 * always changes the number a reader sees: from a fitted 49.6% ("50%"), zoom
 * in goes to 67%, not to 50%.
 */
export function nextZoomStep(zoom: number, direction: 1 | -1): number {
  const shown = Math.round(zoom * 100) / 100;
  const epsilon = 0.001;
  if (direction === 1) return zoomSteps.find((step) => step > shown + epsilon) ?? zoomRange.max;
  return [...zoomSteps].reverse().find((step) => step < shown - epsilon) ?? zoomRange.min;
}

/** The zoom after a Ctrl or ⌘ wheel turn of `deltaY`: smooth, and the same ratio up as down. */
export function wheelZoom(zoom: number, deltaY: number): number {
  return clampZoom(zoom * Math.exp(-Math.max(-120, Math.min(120, deltaY)) * 0.004));
}

function clampAxis(offset: number, start: number, length: number, room: number): number {
  const min = keepInView - (start + length);
  const max = room - keepInView - start;
  return min > max ? offset : Math.min(max, Math.max(min, offset));
}

/**
 * The view, moved only as far as it takes to keep part of the board inside
 * the window. Every gesture that moves or zooms the board ends here (a drag,
 * a pinch, the wheel, the zoom buttons), so none of them can leave the window
 * empty with the board somewhere out of sight.
 */
export function keepInWindow(view: BoardView, bounds: Box | null, window: Size): BoardView {
  if (!bounds) return view;
  return {
    zoom: view.zoom,
    x: clampAxis(view.x, bounds.x * view.zoom, bounds.width * view.zoom, window.width),
    y: clampAxis(view.y, bounds.y * view.zoom, bounds.height * view.zoom, window.height),
  };
}

/** The view moved by a drag, kept so that part of the board always stays inside the window. */
export function panBy(view: BoardView, delta: { x: number; y: number }, bounds: Box | null, window: Size): BoardView {
  return keepInWindow({ zoom: view.zoom, x: view.x + delta.x, y: view.y + delta.y }, bounds, window);
}

/** A box on the page, in CSS pixels, as `getBoundingClientRect` gives it. */
export interface Edges {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * How far the view moves along one axis so `[start, end]` sits inside `[low, high]`. None when it is inside, and none
 * when it covers the whole of `[low, high]`: a move would hide as much of it as it shows. One that fits moves by the
 * least that brings it in. One that cannot fit shows its start.
 */
function nearestAxis(start: number, end: number, low: number, high: number): number {
  if (start >= low && end <= high) return 0;
  if (start <= low && end >= high) return 0;
  if (end - start > high - low) return low - start;
  return start < low ? low - start : high - end;
}

/**
 * How far the view must move, on the page, so `control` sits inside the
 * board's window `pane`: what `scrollIntoView` with "nearest" would scroll,
 * with the sign of a pan (a control past the right edge moves the view left).
 * Zero on an axis where it is inside already, or where it covers the whole
 * window. One difference from "nearest": a control too large for the window
 * that leaves part of the window empty shows its start, where the browser
 * would show its nearer end. A scroll of the window is held to how far its
 * content reaches, and that can be short of the control; a pan has no such
 * limit.
 */
export function panToReveal(control: Edges, pane: Edges): { x: number; y: number } {
  return { x: nearestAxis(control.left, control.right, pane.left, pane.right), y: nearestAxis(control.top, control.bottom, pane.top, pane.bottom) };
}

/** A point in the board's window, in CSS pixels from its top left corner. */
export interface Point {
  x: number;
  y: number;
}

/** Two fingers on the board: the point midway between them, and how far apart they are. */
export interface Pinch {
  center: Point;
  distance: number;
}

/** The middle of two touches and the distance between them. */
export function pinchOf(first: Point, second: Point): Pinch {
  return { center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }, distance: Math.hypot(second.x - first.x, second.y - first.y) };
}

/**
 * The view while two fingers pinch the board. `view` and `from` are the view
 * and the fingers when the pinch began; `to` is the fingers now. The zoom
 * follows how far the fingers moved apart, inside the zoom range, and the
 * board point that was under the middle of the fingers stays under it, so a
 * pinch zooms about the fingers and two fingers moving together pan.
 */
export function pinchView(view: BoardView, from: Pinch, to: Pinch): BoardView {
  const zoom = clampZoom(from.distance > 0 ? view.zoom * (to.distance / from.distance) : view.zoom);
  const ratio = zoom / view.zoom;
  return { zoom, x: to.center.x - (from.center.x - view.x) * ratio, y: to.center.y - (from.center.y - view.y) * ratio };
}

/** The zoom as a whole percent, for the zoom button's label. */
export function zoomPercent(zoom: number): string {
  return `${String(Math.round(zoom * 100))}%`;
}
