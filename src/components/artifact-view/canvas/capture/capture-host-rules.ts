import { captureGeometry, captureLimits, partBox, type CaptureDrawing, type CaptureType, type PartBox } from "@/lib/canvas/capture-rules";
import { isPlainObject } from "@/lib/ui/json-walk";

/**
 * Pure decisions of the capture host (frame-capture-host.tsx): when a tab
 * asks the server what to draw, when a pass ends, which pictures a frame
 * needs, and how a part is encoded. No DOM here, so every rule has a test.
 */

/** Why the host wants a pass: the canvas opened, the tab came back, or its window lost focus after the tab's own save. */
export type PassReason = "open" | "return" | "after-save";

/** A second "the tab came back" signal within this time of a pass is dropped: focus and visibility both fire on one return. */
export const returnQuietMs = 5_000;

/** The narrowest window that draws. Below it the device is a phone, where drawing and uploading cost too much. */
export const minDrawingWindowWidth = 640;

/** What the browser says about the device and the tab right now. */
export interface DrawingConditions {
  /** `navigator.connection.saveData`, where the browser has it. */
  saveData: boolean;
  windowWidth: number;
  /** The document is visible (not a background tab). */
  visible: boolean;
}

/** Whether this tab may draw at all right now: never on a device that asks to save data, in a narrow window, or in a hidden tab. */
export function mayDraw(conditions: DrawingConditions): boolean {
  return !conditions.saveData && conditions.visible && conditions.windowWidth >= minDrawingWindowWidth;
}

/** What the host remembers between signals. */
export interface PassHistory {
  /** A pass is running now. */
  running: boolean;
  /** When the last pass started, in milliseconds, or null before the first. */
  lastStartedAt: number | null;
}

/**
 * Whether a signal starts a pass. One pass runs at a time, and a "the tab
 * came back" signal within `returnQuietMs` of the last pass is dropped.
 */
export function startsPass(reason: PassReason, history: PassHistory, now: number): boolean {
  if (history.running) return false;
  if (reason !== "return" || history.lastStartedAt === null) return true;
  return now - history.lastStartedAt >= returnQuietMs;
}

/**
 * Whether the tab's own save still waits for its images: the artifact was
 * saved since the last pass began. A save alone starts nothing; the host
 * asks this when its window loses focus.
 */
export function ownSaveWaits(savedAt: string | null, seenSavedAt: string | null): boolean {
  return savedAt !== null && savedAt !== seenSavedAt;
}

/** The most batches one pass asks for. A full board is 48 drawings, six batches; the rest is room for frames that change meanwhile. */
export const maxBatchesPerPass = 12;

/** One drawing the server asked for, with the frame it belongs to. */
export interface FrameDrawing<Frame> {
  frame: Frame;
  drawing: CaptureDrawing;
}

/** How a drawing is named in the pass's memory of what it tried. */
export function attemptKey(drawing: CaptureDrawing): string {
  return `${drawing.frameHash}:${drawing.mode}`;
}

/**
 * The drawings of a batch this pass has not tried yet, in order. A pass
 * tries each drawing once: one that failed here is not drawn again until
 * the next pass, so the loop always ends.
 */
export function untriedDrawings<Frame extends { drawings: readonly CaptureDrawing[] }>(frames: readonly Frame[], tried: ReadonlySet<string>): FrameDrawing<Frame>[] {
  const fresh: FrameDrawing<Frame>[] = [];
  const seen = new Set<string>();
  for (const frame of frames) {
    for (const drawing of frame.drawings) {
      const key = attemptKey(drawing);
      if (tried.has(key) || seen.has(key)) continue;
      seen.add(key);
      fresh.push({ frame, drawing });
    }
  }
  return fresh;
}

/** Whether a pass asks the server for another batch: only after a batch that had something new, and within the batch limit. */
export function asksAgain(batches: number, drewSomethingNew: boolean): boolean {
  return drewSomethingNew && batches < maxBatchesPerPass;
}

/** The largest picture the host inlines, in bytes. A larger one is left out and the capture is marked partial. */
export const maxPictureBytes = 10 * 1024 * 1024;

/**
 * The ids of the files a frame's spec shows as pictures: every Image
 * element's `file` that the artifact holds, each once. A File element draws
 * a card, not the file, and an Image whose file is not attached draws a
 * notice, so neither needs a fetch.
 */
export function picturesInSpec(spec: string, attached: ReadonlySet<string>): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(spec);
  } catch {
    return [];
  }
  if (!isPlainObject(parsed) || !isPlainObject(parsed.elements)) return [];
  const ids = new Set<string>();
  for (const element of Object.values(parsed.elements)) {
    if (!isPlainObject(element) || element.type !== "Image" || !isPlainObject(element.props)) continue;
    const file = element.props.file;
    if (typeof file !== "string") continue;
    const id = file.trim().toLowerCase();
    if (attached.has(id)) ids.add(id);
  }
  return [...ids];
}

/** How a frame of `width` whose content is `height` CSS pixels tall is drawn: the height the drawing covers, and each part's box. */
export interface DrawingPlan {
  /** The whole height, as reported to the server. */
  height: number;
  /** The height the parts cover: all of it, unless the frame is taller than the parts allow. */
  drawnHeight: number;
  parts: PartBox[];
}

/**
 * Plans a drawing with the server's own geometry (capture-rules.ts), so
 * every part has exactly the pixel size the finish step checks. `measured`
 * is the content's height as the browser laid it out; a fraction of a pixel
 * rounds up, and the height is at least one pixel.
 */
export function planDrawing(width: number, measured: number): DrawingPlan {
  const height = Math.min(captureLimits.maxRecordedHeight, Math.max(1, Math.ceil(measured)));
  const geometry = captureGeometry(width, height);
  const parts: PartBox[] = [];
  for (let part = 1; part <= geometry.partCount; part += 1) {
    const box = partBox(geometry, width, part);
    if (box) parts.push(box);
  }
  return { height, drawnHeight: geometry.drawnHeight, parts };
}

/** The qualities a part is encoded at, best first, until it fits. */
export const encodeQualities = [0.9, 0.8, 0.7] as const;

/** What an encoder gave back: the bytes' size and the type the browser really wrote. */
export interface EncodedPart<Data> {
  type: string;
  bytes: number;
  data: Data;
}

/** Encodes one part as `type` at `quality`, or null when the browser could not. */
export type PartEncoder<Data> = (type: CaptureType, quality: number) => Promise<EncodedPart<Data> | null>;

/** A part that fits, why it does not, or that the browser cannot write the type. */
export type PartOutcome<Data> = { state: "fits"; part: EncodedPart<Data> } | { state: "too-large" } | { state: "wrong-type" };

/**
 * Encodes a part as `type`, stepping the quality down until it is within
 * the part limit. A browser that cannot write WebP gives another type back
 * without saying so; that is "wrong-type", and the caller tries JPEG.
 */
export async function encodeWithin<Data>(encode: PartEncoder<Data>, type: CaptureType, maxBytes: number = captureLimits.maxPartBytes): Promise<PartOutcome<Data>> {
  for (const quality of encodeQualities) {
    const part = await encode(type, quality);
    if (part?.type !== type) return { state: "wrong-type" };
    if (part.bytes > 0 && part.bytes <= maxBytes) return { state: "fits", part };
  }
  return { state: "too-large" };
}

/** The types a drawing is tried in, in order: WebP, then JPEG where the browser cannot write WebP. */
export const encodeTypes: readonly CaptureType[] = ["image/webp", "image/jpeg"];
