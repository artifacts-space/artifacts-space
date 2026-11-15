import { readJsonInput, readVersionField, stringifyJson } from "@/lib/ui/json-input";
import { isPlainObject } from "@/lib/ui/json-walk";

import { canvasError, canvasWarning, frameError, frameLabel, frameWarning, isBlockingCanvasIssue, type CanvasIssue } from "./issues";
import { canvasLimits, frameIdPattern, frameIdRule, framePaddings, frameSizes, type FramePadding } from "./limits";
import { CANVAS_VERSION, migrateCanvas } from "./version";

/** One frame as read from a canvas: its fields, with fallbacks where a field was unusable. */
export interface CanvasFrameRead {
  /** The frame's id, or a stand-in such as "frame-2" when it had no usable one. */
  id: string;
  /** How messages name the frame: `Frame "home"`, or `Frame 2` when it had no usable id. */
  label: string;
  name: string;
  /** Width in CSS pixels. The desktop size stands in for an unusable width. */
  width: number;
  /** The least height the frame asks for, or null when it follows its content. */
  height: number | null;
  /** Space between the frame's edge and its content. */
  padding: FramePadding;
  /** Where the author put the frame, or null when it is placed automatically. */
  position: { x: number; y: number } | null;
  /** The frame's ui spec as written, or null when it is not an object. */
  spec: Record<string, unknown> | null;
  /** How many elements the spec holds, counted without validating them. */
  elementCount: number;
  /** Problems with the frame's own fields. Problems inside its spec are found by `validateCanvas` and the renderer. */
  issues: CanvasIssue[];
}

/** A canvas as read from its JSON: every frame that could be read, and what is wrong. */
export interface CanvasRead {
  /** False when the canvas cannot be drawn at all. */
  renderable: boolean;
  frames: CanvasFrameRead[];
  /** Problems with the canvas as a whole. Frame problems sit on each frame. */
  issues: CanvasIssue[];
}

const shape = `{ "version": ${String(CANVAS_VERSION)}, "frames": [{ "id": "home", "name": "Home", "width": ${String(frameSizes.desktop)}, "spec": { … } }] }`;
const frameFields: ReadonlySet<string> = new Set(["id", "name", "width", "height", "padding", "x", "y", "spec"]);
/** A canvas's own top-level fields. Anything else is ignored, with a warning. */
const canvasFields: ReadonlySet<string> = new Set(["version", "frames"]);

/** How a canvas names itself when its JSON cannot be read. */
const canvasInput = {
  maxBytes: canvasLimits.maxCanvasBytes,
  noun: "canvas",
  splitInto: "canvases",
  shapeHint: `A canvas is one JSON object: ${shape}.`,
} as const;

function unreadable(issues: CanvasIssue[]): CanvasRead {
  return { renderable: false, frames: [], issues };
}

/** A whole number within [min, max], or null when the value is anything else. */
function wholeNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function standInId(index: number, taken: ReadonlySet<string>): string {
  let id = `frame-${String(index + 1)}`;
  while (taken.has(id)) id = `${id}-x`;
  return id;
}

function idProblem(value: unknown, taken: ReadonlySet<string>): string | null {
  if (typeof value !== "string" || value === "") return `"id" is missing. Give each frame a short id such as "home" or "checkout-phone".`;
  if (value.length > canvasLimits.maxIdLength || !frameIdPattern.test(value)) {
    return `"id" must be up to ${String(canvasLimits.maxIdLength)} ${frameIdRule}, such as "checkout-phone".`;
  }
  return taken.has(value) ? `another frame already has the id "${value}". Frame ids must be unique.` : null;
}

function readName(raw: Record<string, unknown>, fallback: string): { name: string; problem?: string } {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (name === "") return { name: fallback, problem: `"name" is missing. Name the frame for people, such as "Home, desktop".` };
  if (name.length > canvasLimits.maxNameLength) {
    return { name: name.slice(0, canvasLimits.maxNameLength), problem: `"name" is ${String(name.length)} characters; the limit is ${String(canvasLimits.maxNameLength)}.` };
  }
  return { name };
}

function readWidth(raw: Record<string, unknown>): { width: number; problem?: string } {
  const width = wholeNumber(raw.width, canvasLimits.minWidth, canvasLimits.maxWidth);
  if (width !== null) return { width };
  return {
    width: frameSizes.desktop,
    problem: `"width" must be a whole number from ${String(canvasLimits.minWidth)} to ${String(canvasLimits.maxWidth)}, in CSS pixels. Usual sizes: ${String(frameSizes.desktop)} (desktop), ${String(frameSizes.tablet)} (tablet), ${String(frameSizes.phone)} (phone).`,
  };
}

function readHeight(raw: Record<string, unknown>): { height: number | null; problem?: string } {
  if (raw.height === undefined || raw.height === null) return { height: null };
  const height = wholeNumber(raw.height, canvasLimits.minHeight, canvasLimits.maxHeight);
  if (height !== null) return { height };
  return { height: null, problem: `"height" must be a whole number from ${String(canvasLimits.minHeight)} to ${String(canvasLimits.maxHeight)}, or left out so the frame is as tall as its content.` };
}

function readPadding(raw: Record<string, unknown>): { padding: FramePadding; problem?: string } {
  if (raw.padding === undefined || raw.padding === null) return { padding: "md" };
  const padding = framePaddings.find((name) => name === raw.padding);
  if (padding) return { padding };
  return { padding: "md", problem: `"padding" must be one of ${framePaddings.map((name) => `"${name}"`).join(", ")}. Leave it out for "md", or use "none" when the content should reach the frame's edges.` };
}

function readPosition(raw: Record<string, unknown>): { position: { x: number; y: number } | null; problem?: string } {
  const given = (value: unknown) => value !== undefined && value !== null;
  if (!given(raw.x) && !given(raw.y)) return { position: null };
  const max = canvasLimits.maxCoordinate;
  const x = wholeNumber(raw.x, -max, max);
  const y = wholeNumber(raw.y, -max, max);
  if (x !== null && y !== null) return { position: { x, y } };
  return { position: null, problem: `"x" and "y" must both be whole numbers from ${String(-max)} to ${String(max)}. Leave both out to place the frame automatically, to the right of the frame before it.` };
}

function readSpec(raw: Record<string, unknown>): { spec: Record<string, unknown> | null; elementCount: number; problem?: string } {
  if (!isPlainObject(raw.spec)) {
    return { spec: null, elementCount: 0, problem: `"spec" must be a ui spec object: { "version": 1, "root": "…", "elements": { … } }. Call artifacts_formats_guide with kind "ui" for the components.` };
  }
  const elements = raw.spec.elements;
  return { spec: raw.spec, elementCount: isPlainObject(elements) ? Object.keys(elements).length : 0 };
}

/** The frame's fields, each with a stand-in where it was unusable, and what was wrong with them. */
function readFields(raw: Record<string, unknown>, label: string) {
  const name = readName(raw, label);
  const width = readWidth(raw);
  const height = readHeight(raw);
  const padding = readPadding(raw);
  const position = readPosition(raw);
  const spec = readSpec(raw);
  const problems = [name.problem, width.problem, height.problem, padding.problem, position.problem, spec.problem].filter((problem) => problem !== undefined);
  return { fields: { name: name.name, width: width.width, height: height.height, padding: padding.padding, position: position.position, spec: spec.spec, elementCount: spec.elementCount }, problems };
}

function unknownFrameFieldIssues(raw: Record<string, unknown>, id: string, label: string): CanvasIssue[] {
  const extra = Object.keys(raw).filter((key) => !frameFields.has(key));
  if (extra.length === 0) return [];
  const verb = extra.length === 1 ? "is not a frame field and is" : "are not frame fields and are";
  return [frameWarning("unknown_frame_field", id, label, `${extra.map((key) => `"${key}"`).join(", ")} ${verb} ignored. A frame takes id, name, width, height, padding, x, y, and spec.`)];
}

function notAFrame(index: number, taken: Set<string>): CanvasFrameRead {
  const id = standInId(index, taken);
  taken.add(id);
  const label = frameLabel(null, index);
  const issues = [frameError("invalid_frame", id, label, `a frame must be an object such as { "id": "home", "name": "Home", "width": ${String(frameSizes.desktop)}, "spec": { … } }.`)];
  return { id, label, name: label, width: frameSizes.desktop, height: null, padding: "md", position: null, spec: null, elementCount: 0, issues };
}

function readFrame(value: unknown, index: number, taken: Set<string>): CanvasFrameRead {
  if (!isPlainObject(value)) return notAFrame(index, taken);
  const badId = idProblem(value.id, taken);
  const id = badId === null && typeof value.id === "string" ? value.id : standInId(index, taken);
  taken.add(id);
  const label = frameLabel(badId === null ? id : null, index);
  const { fields, problems } = readFields(value, label);
  const errors = [...(badId === null ? [] : [badId]), ...problems].map((problem) => frameError("invalid_frame", id, label, problem));
  return { id, label, ...fields, issues: [...errors, ...unknownFrameFieldIssues(value, id, label)] };
}

function readFrames(values: readonly unknown[]): CanvasFrameRead[] {
  const taken = new Set<string>();
  return values.map((value, index) => readFrame(value, index, taken));
}

function boardIssues(frames: readonly CanvasFrameRead[]): CanvasIssue[] {
  const total = frames.reduce((sum, frame) => sum + frame.elementCount, 0);
  if (total <= canvasLimits.maxElements) return [];
  return [canvasError("too_many_elements", `The canvas has ${total.toLocaleString("en-US")} elements across its frames; the limit is ${canvasLimits.maxElements.toLocaleString("en-US")}. Use Table or List for long data, or split the frames across several canvases.`)];
}

/** A frame's spec as JSON text for the renderer, or null when it has none or it nests too deep to write out. */
export function frameSpecText(frame: Pick<CanvasFrameRead, "spec">): string | null {
  return frame.spec ? stringifyJson(frame.spec) : null;
}

/** A warning for top-level fields a canvas does not take, so a misplaced field (a title, a frame's width) is not lost in silence. */
function unknownFieldIssues(raw: Record<string, unknown>): CanvasIssue[] {
  const extra = Object.keys(raw).filter((key) => !canvasFields.has(key));
  if (extra.length === 0) return [];
  const verb = extra.length === 1 ? "is not a canvas field and is" : "are not canvas fields and are";
  return [canvasWarning("unknown_field", `${extra.map((key) => `"${key}"`).join(", ")} ${verb} ignored. A canvas takes version and frames; a name, width, or spec belongs on a frame.`)];
}

/** The frames list as written, or the issue that says why the board cannot be drawn. */
function framesList(raw: Record<string, unknown>): { values: readonly unknown[] } | { issue: CanvasIssue } {
  const frames: unknown = raw.frames;
  if (!Array.isArray(frames)) return { issue: canvasError("invalid_frames", `"frames" must be a list of frames: ${shape}.`) };
  if (frames.length > canvasLimits.maxFrames) {
    return { issue: canvasError("too_many_frames", `The canvas has ${String(frames.length)} frames; the limit is ${String(canvasLimits.maxFrames)}. Split it into several canvases.`) };
  }
  return { values: frames };
}

/**
 * Reads a canvas from its JSON text (or an already-parsed value): the size
 * limit, the version, and each frame's own fields. It does not validate the
 * frames' ui specs; `validateCanvas` does, and so does the renderer when it
 * draws each one. A frame with unusable fields is still returned, with
 * stand-in values and its issues, so one bad frame never hides the others.
 */
export function readCanvas(input: unknown): CanvasRead {
  const parsed = readJsonInput(input, canvasInput);
  if ("issue" in parsed) return unreadable([parsed.issue]);
  if (!isPlainObject(parsed.value)) return unreadable([canvasError("not_object", `A canvas must be one JSON object: ${shape}.`)]);
  const { version, issue: versionIssue } = readVersionField(parsed.value, CANVAS_VERSION, "so the canvas keeps its meaning as the format evolves");
  const raw = migrateCanvas(parsed.value, version);
  const issues: CanvasIssue[] = [...(versionIssue ? [versionIssue] : []), ...unknownFieldIssues(raw)];
  const list = framesList(raw);
  if ("issue" in list) return unreadable([...issues, list.issue]);
  const frames = readFrames(list.values);
  issues.push(...boardIssues(frames));
  return { renderable: !issues.some(isBlockingCanvasIssue), frames, issues };
}
