import { z } from "zod";

import type { FrameCaptureRecord } from "@/db/frame-capture-schema";
import type { ArtifactRecord } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { getEditableArtifact } from "@/lib/access";
import { fileLimits } from "@/lib/files/config";
import { imageHeaderBytes, readImageHeader } from "@/lib/files/image-size-rules";
import { contentDisposition } from "@/lib/files/names";
import { headObject, presignDownload, r2ConfigFromEnv, readObject, readObjectStart } from "@/lib/files/r2";
import { isPublicId } from "@/lib/public-id";
import { UserFacingError } from "@/lib/user-facing-error";

import {
  canvasAtCap,
  canvasFull,
  chosenMode,
  frameHasProblems,
  frameImageStates,
  imagesOff,
  linkNotReady,
  linkWaitSeconds,
  noSuchPart,
  notDrawnYet,
  themeUnreadable,
  type FrameImageFacts,
  type FrameImageRefusal,
  type FrameImageStates,
} from "./capture-read-rules";
import { captureGeometry, captureLimits, captureModes, captureObjectKey, countsTowardStorage, drawingKey, partBox, type CaptureDrawing, type PartBox } from "./capture-rules";
import { capturesAreOn } from "./captures";
import { boardDrawings, loadCaptureBoard, ThemeUnreadableError, type BoardFrame, type CaptureBoard } from "./captures-board";
import { getReadyCapture, listLiveCaptures, removeCapture } from "./captures-store";
import { noSuchFrameMessage } from "./frame-edits";

/**
 * Reading a frame capture: the image of a frame's current content, for a
 * caller who may edit the canvas, and for nobody else. An editor's browser
 * chose the pixels, and an edit to a link or public canvas waits for
 * approval, so an image must never reach a reader of the approved version:
 * every path here starts from `getEditableArtifact`. Only the ready capture
 * of the content that is on the board now is handed out, never an older
 * one, and its stored bytes are checked again before they leave. Nothing
 * here logs an object key or a link.
 */

export const frameImageSchema = z.object({
  publicId: z.string().refine(isPublicId, "Use the artifact's 22-character id."),
  frameId: z.string().min(1).max(80),
  mode: z.enum(captureModes).optional(),
  part: z.number().int().min(1).max(captureLimits.maxParts).optional(),
  as: z.enum(["image", "link"]).optional(),
});

export type FrameImageInput = z.input<typeof frameImageSchema>;

/** What a read hands back: the picture, a link to it, or why there is none. */
export type FrameImageResult =
  | { state: "image"; facts: FrameImageFacts; bytes: Uint8Array<ArrayBuffer> }
  | { state: "link"; facts: FrameImageFacts; url: string; expiresAt: Date }
  | { state: "refused"; refusal: FrameImageRefusal };

const refused = (refusal: FrameImageRefusal): FrameImageResult => ({ state: "refused", refusal });

/** The canvas the caller may edit. A reader, and someone who cannot see it at all, get the same words. */
async function editableCanvas(userId: string, publicId: string): Promise<ArtifactRecord> {
  const record = await getEditableArtifact(userId, { publicId });
  if (!record) throw new UserFacingError("Artifact not found, or you cannot edit it. Only people and agents who can edit a canvas get images of its frames.");
  if (record.kind !== "canvas") throw new UserFacingError(`This artifact is ${record.kind} content, not a canvas, so it has no frames.`);
  return record;
}

/** The frame as the board draws it, or why it has no drawing. Throws when the canvas has no such frame. */
function frameOnBoard(board: CaptureBoard, frameId: string): BoardFrame | FrameImageRefusal {
  const frame = board.frames.find((candidate) => candidate.id === frameId);
  if (frame) return frame;
  // On the canvas, but never drawn: it has errors, so the board shows a notice in its place.
  if (board.frameIds.includes(frameId)) return frameHasProblems;
  if (!board.readable) throw new UserFacingError("This canvas cannot be read, so it has no frames to draw. Read its problems with canvas_frames_list.");
  throw new UserFacingError(noSuchFrameMessage(frameId, board.frameIds));
}

/** Why a frame's current content has no image: the canvas is at its cap, or nobody's browser has drawn it yet. */
async function whyNotDrawn(artifactId: string, board: CaptureBoard, now: Date): Promise<FrameImageRefusal> {
  const current = new Set(boardDrawings(board).map(drawingKey));
  const rows = (await listLiveCaptures(artifactId)).filter((row) => current.has(drawingKey(row)) && countsTowardStorage(row, now));
  return canvasAtCap(rows.reduce((sum, row) => sum + row.bytes, 0)) ? canvasFull : notDrawnYet;
}

const storedType = (contentType: string) => (contentType.split(";")[0] ?? "").trim().toLowerCase();

/** Whether these first bytes are the picture the capture describes for this part: its type, and its exact pixel size. */
function isThePart(row: FrameCaptureRecord, box: PartBox, type: string, start: Uint8Array): boolean {
  if (storedType(type) !== row.contentType) return false;
  const header = readImageHeader(start.subarray(0, imageHeaderBytes));
  return header?.type === row.contentType && header.width === box.width && header.height === box.height;
}

/** The part's bytes when the stored object is still the checked part, or null when it is gone, too large, or another picture. */
async function checkedBytes(row: FrameCaptureRecord, box: PartBox, part: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const object = await readObject(r2ConfigFromEnv(), captureObjectKey(row.artifactId, row.id, part), captureLimits.maxPartBytes);
  return object.state === "found" && isThePart(row, box, object.contentType, object.bytes) ? object.bytes : null;
}

/** Whether the stored object still passes the checks finish made, without reading all of it: for a link. */
async function storedStillChecks(row: FrameCaptureRecord, box: PartBox, part: number): Promise<boolean> {
  const config = r2ConfigFromEnv();
  const key = captureObjectKey(row.artifactId, row.id, part);
  const stored = await headObject(config, key);
  if (!stored || stored.size <= 0 || stored.size > captureLimits.maxPartBytes) return false;
  return isThePart(row, box, stored.contentType, await readObjectStart(config, key, imageHeaderBytes));
}

/** A capture whose stored part failed its check is removed, so the next open canvas draws the frame again. */
async function removeFailed(row: FrameCaptureRecord, now: Date): Promise<FrameImageResult> {
  await removeCapture(row.id, now);
  console.error("[captures] A stored frame image failed its check when it was read, and was removed.");
  return refused(notDrawnYet);
}

function factsOf(row: FrameCaptureRecord, frameId: string, part: number, box: PartBox): FrameImageFacts {
  return {
    frameId,
    mode: row.mode,
    part,
    partCount: row.partCount,
    covers: box,
    frameWidth: row.width,
    frameHeight: row.height,
    drawnHeight: row.drawnHeight,
    contentType: row.contentType,
    partial: row.partial,
    drawnAt: (row.capturedAt ?? row.startedAt).toISOString(),
  };
}

const extension = (contentType: string) => (contentType === "image/jpeg" ? "jpg" : "webp");

/** A link to one checked part that works as long as a file download link does. The object's own type is the answer's type. */
async function linkTo(row: FrameCaptureRecord, facts: FrameImageFacts): Promise<FrameImageResult> {
  const filename = `frame-${facts.frameId}-${facts.mode}-${String(facts.part)}.${extension(row.contentType)}`;
  const signed = await presignDownload(r2ConfigFromEnv(), {
    key: captureObjectKey(row.artifactId, row.id, facts.part),
    contentType: row.contentType,
    disposition: contentDisposition(filename, true),
    expiresIn: fileLimits.downloadUrlSeconds,
  });
  return { state: "link", facts, url: signed.url, expiresAt: signed.expiresAt };
}

/**
 * A link to one part, signed only once the drawer's upload URLs have ended
 * and the stored object still passes its check: after that nobody can put
 * the object again, so the link serves what was checked.
 */
async function serveLink(row: FrameCaptureRecord, box: PartBox, facts: FrameImageFacts, now: Date): Promise<FrameImageResult> {
  const wait = linkWaitSeconds(row.startedAt, now);
  if (wait > 0) return refused(linkNotReady(wait));
  return (await storedStillChecks(row, box, facts.part)) ? linkTo(row, facts) : removeFailed(row, now);
}

/** Hands out one part of a ready capture, after checking what is stored once more. */
async function servePart(row: FrameCaptureRecord, frameId: string, wanted: { part: number; link: boolean }, now: Date): Promise<FrameImageResult> {
  const geometry = captureGeometry(row.width, row.height);
  if (geometry.partCount !== row.partCount) return removeFailed(row, now);
  const box = partBox(geometry, row.width, wanted.part);
  if (!box) return refused(noSuchPart(row.partCount));
  const facts = factsOf(row, frameId, wanted.part, box);
  if (wanted.link) return serveLink(row, box, facts, now);
  const bytes = await checkedBytes(row, box, wanted.part);
  return bytes ? { state: "image", facts, bytes } : removeFailed(row, now);
}

async function boardOrNull(record: ArtifactRecord): Promise<CaptureBoard | null> {
  try {
    return await loadCaptureBoard(record);
  } catch (error) {
    if (error instanceof ThemeUnreadableError) return null;
    throw error;
  }
}

/** The drawing of a frame's current content in the mode the caller gets, or why there is none. */
function drawingOf(board: CaptureBoard, frameId: string, asked: FrameImageInput["mode"]): CaptureDrawing | FrameImageRefusal {
  const frame = frameOnBoard(board, frameId);
  if ("code" in frame) return frame;
  const chosen = chosenMode(board.theme.mode, asked);
  if ("refused" in chosen) return chosen.refused;
  return frame.drawings.find((drawing) => drawing.mode === chosen.mode) ?? notDrawnYet;
}

/**
 * One part of the image of a frame's current content, for `userId`, who
 * must be able to edit the canvas: a reader of a link or public canvas, and
 * anyone who cannot see it, is refused as "not found". Where frame images
 * are off it says so before it reads or counts anything. Reads are rate
 * limited per person, before the first read of the database or of storage.
 * A stored part that is no longer the checked picture (its type, its exact
 * pixel size, at most a part's bytes) is never handed out: its capture is
 * removed and the answer is "no image yet". Throws UserFacingError for a
 * caller who may not edit, an artifact that is not a canvas, and a frame id
 * the canvas does not have.
 */
export async function readFrameImage(userId: string, input: FrameImageInput, now: Date = new Date()): Promise<FrameImageResult> {
  const parsed = frameImageSchema.parse(input);
  if (!capturesAreOn()) return refused(imagesOff);
  await enforceRateLimit("frameImageRead", userId);
  const record = await editableCanvas(userId, parsed.publicId);
  const board = await boardOrNull(record);
  if (!board) return refused(themeUnreadable);
  const drawing = drawingOf(board, parsed.frameId, parsed.mode);
  if ("code" in drawing) return refused(drawing);
  const row = await getReadyCapture(record.id, drawing);
  if (!row) return refused(await whyNotDrawn(record.id, board, now));
  return servePart(row, parsed.frameId, { part: parsed.part ?? 1, link: parsed.as === "link" }, now);
}

/**
 * Which of each frame's images are current, for the frame lists: by frame
 * id, an entry for each mode the theme draws. Null when there is nothing to
 * say: frame images are off, the caller may not edit the artifact, it is
 * not a canvas, or its theme could not be read. One query reads every
 * capture of the canvas.
 */
export async function frameImageStatesFor(userId: string, publicId: string): Promise<Map<string, FrameImageStates> | null> {
  if (!capturesAreOn()) return null;
  const record = await getEditableArtifact(userId, { publicId });
  if (record?.kind !== "canvas") return null;
  const board = await boardOrNull(record);
  if (!board) return null;
  return frameImageStates(board.frames, await listLiveCaptures(record.id));
}
