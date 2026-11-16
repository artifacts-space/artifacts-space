import { formatUiSpecIssues } from "@/lib/ui/issues";
import { isPlainObject } from "@/lib/ui/json-walk";
import { UserFacingError } from "@/lib/user-facing-error";

import type { CanvasIssue } from "./issues";
import { placeFrames } from "./layout";
import { canvasLimits, type FramePadding } from "./limits";
import type { CanvasFrameRead } from "./read";
import { validateCanvas } from "./validate";
import { CANVAS_VERSION } from "./version";

/**
 * Reading and changing one frame of a canvas, as pure functions on the
 * canvas's JSON text. The frame tools (src/lib/mcp/canvas-tools.ts) use them
 * so an agent can look at or change one screen without resending the board.
 * Every change is checked like a whole canvas, and a refused change says
 * which frame and element are wrong and how to fix them.
 */

/** A change to a canvas that cannot be made. The message is written for the agent that asked. */
export class CanvasEditError extends UserFacingError {
  constructor(message: string) {
    super(message);
    this.name = "CanvasEditError";
  }
}

/** One frame in a board's outline: its own fields and how it stands, without its spec. */
export interface FrameOutline {
  id: string;
  name: string;
  width: number;
  /** The least height the frame asks for, or null when it follows its content. */
  height: number | null;
  padding: FramePadding;
  /** The frame's top-left corner on the board. `auto` is true when the board placed it: the frame has no x and y of its own. */
  position: { x: number; y: number; auto: boolean };
  /** How many elements its spec holds. */
  elements: number;
  /** How many problems keep the frame from being drawn. canvas_frame_get lists them. */
  problems: number;
}

/** A canvas without its specs: every frame's outline, and the board's totals. */
export interface BoardOutline {
  /** False when the canvas cannot be read at all; `problems` says why. */
  readable: boolean;
  frames: FrameOutline[];
  /** Elements across all frames. */
  elements: number;
  /** The canvas's size in bytes. */
  bytes: number;
  /** Problems with the canvas as a whole, such as a limit it passes. */
  problems: string[];
}

/** One frame in full: the frame as written, its outline, and each problem it has. */
export interface FrameDetail {
  frame: Record<string, unknown>;
  outline: FrameOutline;
  problems: string[];
}

/** Where a frame goes in the order: right after another frame, or at a position counted from 0. */
export interface FramePlace {
  after?: string | undefined;
  index?: number | undefined;
}

/** A frame's own fields to change. Null removes an optional field (height, padding, x, y). */
export interface FrameChanges {
  name?: string | undefined;
  width?: number | undefined;
  height?: number | null | undefined;
  padding?: string | null | undefined;
  x?: number | null | undefined;
  y?: number | null | undefined;
}

/** A canvas after one change. */
export interface FrameEdit {
  /** The canvas's new JSON text. */
  content: string;
  /** The id of the frame that was saved, changed, or deleted. */
  frameId: string;
  /** True when the frame is new to the canvas. */
  added: boolean;
  /** False when the change left the canvas as it was, so there is nothing to save. */
  changed: boolean;
}

const encoder = new TextEncoder();

const errorsOf = (issues: readonly CanvasIssue[]) => issues.filter((issue) => issue.severity === "error");

function outlineOf(frame: CanvasFrameRead, place: { x: number; y: number } | undefined, issues: readonly CanvasIssue[]): FrameOutline {
  return {
    id: frame.id,
    name: frame.name,
    width: frame.width,
    height: frame.height,
    padding: frame.padding,
    position: { x: place?.x ?? 0, y: place?.y ?? 0, auto: frame.position === null },
    elements: frame.elementCount,
    problems: errorsOf(issues).filter((issue) => issue.frameId === frame.id).length,
  };
}

/** A canvas's outline: each frame without its spec, and the board's totals. A canvas that cannot be read has no frames and says why. */
export function boardOutline(content: string): BoardOutline {
  const checked = validateCanvas(content);
  const places = placeFrames(checked.frames);
  const frames = checked.frames.map((frame, index) => outlineOf(frame, places[index], checked.issues));
  return {
    readable: checked.renderable,
    frames,
    elements: frames.reduce((sum, frame) => sum + frame.elements, 0),
    bytes: encoder.encode(content).length,
    problems: errorsOf(checked.issues).filter((issue) => issue.frameId === undefined).map((issue) => issue.message),
  };
}

/** A canvas opened for a change: its JSON as written, its frames, and the id each frame goes by. */
interface OpenBoard {
  canvas: Record<string, unknown>;
  frames: unknown[];
  ids: string[];
  /** The canvas as checked when it was opened. */
  checked: ReturnType<typeof validateCanvas>;
  /** Two-space indented when the canvas was, compact when it was. */
  indent: number | undefined;
}

function openBoard(content: string): OpenBoard {
  const checked = validateCanvas(content);
  if (!checked.renderable) {
    throw new CanvasEditError(`This canvas cannot be read, so its frames cannot be read or changed one at a time: ${checked.issues[0]?.message ?? "its content is not a canvas."} Fix the whole canvas with artifacts_update.`);
  }
  const canvas: unknown = JSON.parse(content);
  if (!isPlainObject(canvas) || !Array.isArray(canvas.frames)) throw new CanvasEditError("This canvas cannot be read. Fix the whole canvas with artifacts_update.");
  return { canvas, frames: [...(canvas.frames as unknown[])], ids: checked.frames.map((frame) => frame.id), checked, indent: content.includes("\n") ? 2 : undefined };
}

function listIds(ids: readonly string[]): string {
  return ids.length === 0 ? "This canvas has no frames yet." : `The frames are: ${ids.map((id) => `"${id}"`).join(", ")}.`;
}

/** What a caller hears when a canvas has no frame with the id it asked for: the ids the canvas has. */
export function noSuchFrameMessage(frameId: string, ids: readonly string[]): string {
  return `No frame has the id "${frameId}". ${listIds(ids)}`;
}

function indexOfFrame(board: OpenBoard, frameId: string): number {
  const index = board.ids.indexOf(frameId);
  if (index === -1) throw new CanvasEditError(noSuchFrameMessage(frameId, board.ids));
  return index;
}

/** One frame in full, by its id. Throws when the canvas cannot be read or has no such frame. */
export function frameDetail(content: string, frameId: string): FrameDetail {
  const board = openBoard(content);
  const index = indexOfFrame(board, frameId);
  const frame = board.frames[index];
  const read = board.checked.frames[index];
  if (!isPlainObject(frame) || !read) throw new CanvasEditError(`The frame "${frameId}" is not an object, so it has nothing to read. Replace it with canvas_frame_save.`);
  const outline = outlineOf(read, placeFrames(board.checked.frames)[index], board.checked.issues);
  return { frame, outline, problems: errorsOf(board.checked.issues).filter((issue) => issue.frameId === frameId).map((issue) => issue.message) };
}

/** Where a frame goes among `others` (the frames without it); null when no place was asked for. */
function placeAmong(others: readonly string[], frameId: string, place: FramePlace): number | null {
  if (place.after !== undefined && place.index !== undefined) throw new CanvasEditError("Pass `after` or `index`, not both: `after` names the frame to follow, `index` counts the position from 0.");
  if (place.index !== undefined) return Math.min(Math.max(0, Math.trunc(place.index)), others.length);
  if (place.after === undefined) return null;
  if (place.after === frameId) throw new CanvasEditError(`A frame cannot go after itself. Pass another frame's id in \`after\`, or \`index\` to count the position from 0.`);
  const index = others.indexOf(place.after);
  if (index === -1) throw new CanvasEditError(`\`after\` names "${place.after}", and no frame has that id. ${listIds(others)}`);
  return index + 1;
}

function refusal(what: string, issues: readonly CanvasIssue[]): CanvasEditError {
  return new CanvasEditError(`${what} Nothing was saved. Fix these and try again:\n${formatUiSpecIssues(errorsOf(issues))}`);
}

/** The canvas with these frames, checked as a whole, as text. Throws with every problem when it is not valid. */
function closeBoard(board: OpenBoard, frames: readonly unknown[], before: string, edit: { frameId: string; added: boolean; what: string }): FrameEdit {
  const canvas = { ...board.canvas, frames };
  const content = JSON.stringify(canvas, null, board.indent);
  const checked = validateCanvas(content);
  if (!checked.valid) throw refusal(edit.what, checked.issues);
  return { content, frameId: edit.frameId, added: edit.added, changed: JSON.stringify(canvas) !== JSON.stringify(JSON.parse(before)) };
}

/** The frames with one of them moved to `to`, or added there. */
function withFrameAt(frames: readonly unknown[], from: number | null, to: number, frame: unknown): unknown[] {
  const others = from === null ? [...frames] : frames.filter((_, index) => index !== from);
  return [...others.slice(0, to), frame, ...others.slice(to)];
}

/** The id a frame object asks for, once the frame is known to be valid on its own. */
function ownId(frame: Record<string, unknown>): string {
  return typeof frame.id === "string" ? frame.id : "";
}

/**
 * Adds a frame to a canvas, or replaces the frame that has the same id. A
 * new frame goes at `place`, or at the end; a replaced frame keeps its place
 * unless `place` moves it. The frame is checked on its own first, so its
 * problems are reported without the rest of the board, then the board's
 * limits are checked with it in.
 */
export function saveFrame(content: string, frame: unknown, place: FramePlace = {}): FrameEdit {
  const board = openBoard(content);
  if (!isPlainObject(frame)) throw new CanvasEditError(`\`frame\` must be one frame object such as { "id": "home", "name": "Home", "width": 1440, "spec": { … } }. Nothing was saved.`);
  const alone = validateCanvas({ version: CANVAS_VERSION, frames: [frame] });
  if (!alone.valid) throw refusal("The frame is not valid.", alone.issues);
  const frameId = ownId(frame);
  const existing = board.ids.indexOf(frameId);
  const from = existing === -1 ? null : existing;
  const asked = placeAmong(board.ids.filter((id) => id !== frameId), frameId, place);
  const to = asked ?? from ?? board.frames.length;
  return closeBoard(board, withFrameAt(board.frames, from, to, frame), content, { frameId, added: from === null, what: "The canvas would not be valid with this frame." });
}

const changeable = ["name", "width", "height", "padding", "x", "y"] as const;

/** The frame with the changes applied: a value replaces the field, null removes it. */
function withChanges(frame: Record<string, unknown>, changes: FrameChanges): Record<string, unknown> {
  const removed: ReadonlySet<string> = new Set(changeable.filter((field) => changes[field] === null));
  const set = Object.fromEntries(changeable.flatMap((field) => (changes[field] === undefined || changes[field] === null ? [] : [[field, changes[field]]])));
  return { ...Object.fromEntries(Object.entries(frame).filter(([field]) => !removed.has(field))), ...set };
}

/**
 * Changes a frame's own fields (name, width, height, padding, x, y) and its
 * place in the order, leaving its spec as it is. Null removes an optional
 * field: the frame then follows its content (height), uses the usual
 * padding, or is placed by the board (x and y).
 */
export function updateFrame(content: string, frameId: string, changes: FrameChanges, place: FramePlace = {}): FrameEdit {
  const board = openBoard(content);
  const from = indexOfFrame(board, frameId);
  const frame = board.frames[from];
  if (!isPlainObject(frame)) throw new CanvasEditError(`The frame "${frameId}" is not an object, so its fields cannot be changed. Replace it with canvas_frame_save.`);
  const asked = placeAmong(board.ids.filter((id) => id !== frameId), frameId, place);
  if (asked === null && changeable.every((field) => changes[field] === undefined)) {
    throw new CanvasEditError("Nothing to change. Pass at least one of name, width, height, padding, x, y, after, or index.");
  }
  return closeBoard(board, withFrameAt(board.frames, from, asked ?? from, withChanges(frame, changes)), content, { frameId, added: false, what: "The frame would not be valid with these changes." });
}

/** Removes a frame from a canvas. The other frames keep their order; frames placed by the board close the gap. */
export function deleteFrame(content: string, frameId: string): FrameEdit {
  const board = openBoard(content);
  const from = indexOfFrame(board, frameId);
  return closeBoard(board, board.frames.filter((_, index) => index !== from), content, { frameId, added: false, what: "The canvas would not be valid without this frame." });
}

/** The board's limits, as the outline reports them beside its totals. */
export const boardLimits = { frames: canvasLimits.maxFrames, elements: canvasLimits.maxElements, bytes: canvasLimits.maxCanvasBytes } as const;
