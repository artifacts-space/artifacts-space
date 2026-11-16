// Relative imports only: the database schema loads this file through drizzle-kit, without the "@/" alias.
import type { FramePadding } from "./limits";

/**
 * Pure rules for frame captures: images of canvas frames that the browser of
 * someone who may edit the canvas draws, so an agent can see a frame. What
 * decides the pixels (the hash input), how a drawing is cut into parts a
 * model reads at full size, the limits, and what a canvas still needs.
 * Client-safe: the tab that draws reads the same geometry as the server.
 */

/** A capture shows a frame in one of these. */
export const captureModes = ["light", "dark"] as const;
export type CaptureMode = (typeof captureModes)[number];

/** pending: its parts are uploading. ready: checked and current. removed: its objects are being deleted. */
export const captureStatuses = ["pending", "ready", "removed"] as const;
export type CaptureStatus = (typeof captureStatuses)[number];

/** What a part may be: WebP, or JPEG where the browser cannot encode WebP. */
export const captureTypes = ["image/webp", "image/jpeg"] as const;
export type CaptureType = (typeof captureTypes)[number];

/**
 * Raise this when a release changes how frames draw, so every image is drawn again.
 * 2: a Diagram keeps inside a centered Box, and a tab that is not selected has the secondary text color.
 */
export const CAPTURE_REVISION = 2;

/** How long a part's upload URL works, in seconds. Parts are small, so this is short. */
const uploadUrlSeconds = 120;

/** Every capture limit that is not a rate limit (those are in src/lib/abuse/limits.ts). */
export const captureLimits = {
  /** A model reads an image in square patches of this many pixels. */
  patchPixels: 28,
  /** Most patches in one part, and so its longest edge in pixels: past either, a model scales the image down. */
  maxPatches: 1_568,
  /** Pixels a part shares with the part above it (and a column with the one beside it), so a line cut at one edge is whole in the next. */
  overlapPixels: 56,
  /** Most parts in one drawing. A taller frame is drawn to this height, and the text says how much is left out. */
  maxParts: 12,
  /** Largest part, in bytes (300 KB). */
  maxPartBytes: 300 * 1024,
  /** Tallest frame height a drawing may record, in CSS pixels. */
  maxRecordedHeight: 1_000_000,
  /** Most drawings the server hands a tab at once. */
  batchDrawings: 8,
  /** Most unfinished captures one person may have at once. */
  maxPendingPerUser: 16,
  /** Most bytes of current images one canvas keeps (100 MB). A usual board is under 5 MB. */
  maxCanvasBytes: 100 * 1024 * 1024,
  /** A drawing another tab started within this time is left to that tab. */
  claimMs: 2 * 60 * 1000,
  uploadUrlSeconds,
  /** Captures not finished within this time are removed. */
  pendingTtlMs: 60 * 60 * 1000,
  /**
   * A removed capture's row stays this long after it started: its upload
   * URLs may still work until then, and the row is what lets the cleanup job
   * delete a part that arrives late.
   */
  removalGraceMs: (uploadUrlSeconds + 30) * 1000,
} as const;

/** How a frame's drawing is cut into parts. */
export interface CaptureGeometry {
  /** 1, or 2 for a frame wider than a part may be. */
  columns: 1 | 2;
  /** Each part's width in pixels. */
  partWidth: number;
  /** The height of every part but those of the last row, which may be shorter. */
  partHeight: number;
  rows: number;
  partCount: number;
  /** How much of the frame's height the parts cover: all of it, unless the frame is taller than the parts allow. */
  drawnHeight: number;
}

/** One part's place in the drawing, in CSS pixels from the frame's top left corner. */
export interface PartBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function columnsFor(width: number): 1 | 2 {
  return width > captureLimits.maxPatches ? 2 : 1;
}

/**
 * Cuts a frame of `width` by `height` CSS pixels into parts. Nothing is ever
 * scaled: a part has at most `maxPatches` patches, so a model reads it at
 * full size. A frame wider than that is cut into two columns that share
 * `overlapPixels`; rows share them too.
 */
export function captureGeometry(width: number, height: number): CaptureGeometry {
  const { patchPixels, maxPatches, overlapPixels, maxParts } = captureLimits;
  const columns = columnsFor(width);
  const partWidth = columns === 1 ? width : Math.ceil((width + overlapPixels) / 2);
  const partHeight = Math.min(maxPatches, Math.floor(maxPatches / Math.ceil(partWidth / patchPixels)) * patchPixels);
  const stride = partHeight - overlapPixels;
  const rowsNeeded = height <= partHeight ? 1 : 1 + Math.ceil((height - partHeight) / stride);
  const rows = Math.min(rowsNeeded, Math.floor(maxParts / columns));
  const drawnHeight = rows < rowsNeeded ? partHeight + (rows - 1) * stride : height;
  return { columns, partWidth, partHeight, rows, partCount: rows * columns, drawnHeight };
}

/**
 * Where part `part` (from 1) sits. Parts are numbered left to right, then
 * top to bottom. Null when the drawing has no such part.
 */
export function partBox(geometry: CaptureGeometry, width: number, part: number): PartBox | null {
  if (!Number.isInteger(part) || part < 1 || part > geometry.partCount) return null;
  const row = Math.floor((part - 1) / geometry.columns);
  const column = (part - 1) % geometry.columns;
  const y = row * (geometry.partHeight - captureLimits.overlapPixels);
  return { x: column === 0 ? 0 : width - geometry.partWidth, y, width: geometry.partWidth, height: Math.min(geometry.partHeight, geometry.drawnHeight - y) };
}

/** A part as the tab says it will upload it. */
export interface PartClaim {
  bytes: number;
  contentType: string;
}

/** True when `type` is a type a part may have. */
export function isCaptureType(type: string): type is CaptureType {
  return captureTypes.some((allowed) => allowed === type);
}

/** Why these parts cannot be the drawing `geometry` describes, or null when they can. */
export function partsProblem(geometry: CaptureGeometry, parts: readonly PartClaim[]): string | null {
  if (parts.length !== geometry.partCount) return `This frame is drawn in ${String(geometry.partCount)} ${geometry.partCount === 1 ? "part" : "parts"}, not ${String(parts.length)}.`;
  const type = parts[0]?.contentType ?? "";
  if (!isCaptureType(type) || parts.some((part) => part.contentType !== type)) return "Every part must be WebP, or every part JPEG.";
  const sized = parts.every((part) => Number.isInteger(part.bytes) && part.bytes > 0 && part.bytes <= captureLimits.maxPartBytes);
  return sized ? null : `A part can be at most ${String(captureLimits.maxPartBytes / 1024)} KB.`;
}

/** The R2 key of one part. The capture's own id is in it, so two captures never share a key. */
export function captureObjectKey(artifactId: string, captureId: string, part: number): string {
  return `captures/${artifactId}/${captureId}/${String(part)}`;
}

/** The R2 keys of all parts of a capture, in order. */
export function captureObjectKeys(artifactId: string, captureId: string, partCount: number): string[] {
  return Array.from({ length: partCount }, (_, index) => captureObjectKey(artifactId, captureId, index + 1));
}

/** The modes a theme is drawn in: both, or the one mode the theme pins. */
export function captureModesFor(themeMode: "auto" | CaptureMode): CaptureMode[] {
  return themeMode === "auto" ? [...captureModes] : [themeMode];
}

/** What the hash knows of a file the frame's spec names. */
export interface CaptureFileFacts {
  id: string;
  /** False when the artifact does not hold the file: the frame then shows a notice in its place. */
  attached: boolean;
  /** The stored object, which changes when the file is replaced. */
  key?: string;
  name?: string;
  size?: number;
  type?: string;
}

/** Everything that decides a frame's pixels in one mode. */
export interface CaptureHashInput {
  width: number;
  height: number | null;
  padding: FramePadding;
  spec: unknown;
  /** The resolved theme, as JSON. */
  theme: unknown;
  mode: CaptureMode;
  files: readonly CaptureFileFacts[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** JSON with every object's keys in order, so the same value always gives the same text. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => (isRecord(inner) ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => compareText(a, b))) : inner));
}

/**
 * The text the server hashes (SHA-256) into a capture's `frame_hash`: the
 * frame's width, height, padding, and spec, the theme, the mode, the files
 * the spec names, and the capture revision. The frame's name, id, and place
 * on the board are left out, so a rename or a move keeps the image, and two
 * frames with the same content share one. Null when the spec nests too deep
 * to write out; such a frame is not drawn.
 */
export function captureHashInput(input: CaptureHashInput): string | null {
  const files = [...input.files].sort((a, b) => compareText(a.id, b.id));
  try {
    return canonicalJson({ revision: CAPTURE_REVISION, width: input.width, height: input.height, padding: input.padding, spec: input.spec, theme: input.theme, mode: input.mode, files });
  } catch {
    return null;
  }
}

/** Whether frames are drawn here: "on", or why not. */
export type CaptureAvailability = "on" | "off" | "preview" | "no-storage";

/** The environment values that turn captures off. Passed in, so this file never reads the environment. */
export interface CaptureEnv {
  FRAME_CAPTURES?: string | undefined;
  VERCEL_ENV?: string | undefined;
}

/**
 * Whether captures run: off with FRAME_CAPTURES=off, on preview deployments
 * (they share the production database, and the bucket refuses their origin),
 * and where file storage is not set up.
 */
export function captureAvailability(env: CaptureEnv, storageConfigured: boolean): CaptureAvailability {
  if ((env.FRAME_CAPTURES ?? "").trim().toLowerCase() === "off") return "off";
  if (env.VERCEL_ENV === "preview") return "preview";
  return storageConfigured ? "on" : "no-storage";
}

/** One drawing: a content in a mode. */
export interface CaptureDrawing {
  frameHash: string;
  mode: CaptureMode;
}

/** What a stored capture says about a drawing. */
export interface CaptureRowFacts extends CaptureDrawing {
  status: CaptureStatus;
  startedAt: Date;
}

/** How one drawing is named in sets and SQL: its hash and its mode. */
export function drawingKey(drawing: CaptureDrawing): string {
  return `${drawing.frameHash}:${drawing.mode}`;
}

function isCovered(row: CaptureRowFacts, now: Date): boolean {
  if (row.status === "ready") return true;
  return row.status === "pending" && now.getTime() - row.startedAt.getTime() < captureLimits.claimMs;
}

/**
 * The drawings a canvas still needs, light ones first, each once: those on
 * the board with no ready image and none that another tab started within
 * `claimMs`. `board` is every drawing of the current content, in board order.
 */
export function neededDrawings(board: readonly CaptureDrawing[], rows: readonly CaptureRowFacts[], now: Date): CaptureDrawing[] {
  const covered = new Set(rows.filter((row) => isCovered(row, now)).map(drawingKey));
  const seen = new Set<string>();
  const needed: CaptureDrawing[] = [];
  for (const mode of captureModes) {
    for (const drawing of board) {
      const key = drawingKey(drawing);
      if (drawing.mode !== mode || covered.has(key) || seen.has(key)) continue;
      seen.add(key);
      needed.push(drawing);
    }
  }
  return needed;
}

/** Bytes that count toward a canvas's cap or a person's quota: ready captures, and pending ones still within their time. */
export function countsTowardStorage(row: Pick<CaptureRowFacts, "status" | "startedAt">, now: Date): boolean {
  if (row.status === "ready") return true;
  return row.status === "pending" && now.getTime() - row.startedAt.getTime() < captureLimits.pendingTtlMs;
}

/** Whether `adding` more bytes fit under the canvas's cap. */
export function fitsCanvasCap(usedBytes: number, adding: number): boolean {
  return usedBytes + adding <= captureLimits.maxCanvasBytes;
}

/** Whether a removed capture's row may go: its upload URLs can no longer work. */
export function removalIsFinal(startedAt: Date, now: Date): boolean {
  return now.getTime() - startedAt.getTime() >= captureLimits.removalGraceMs;
}
