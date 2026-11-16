import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { FrameCaptureRecord } from "@/db/frame-capture-schema";
import type { ArtifactRecord } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { getEditableArtifact } from "@/lib/access";
import { byteLength } from "@/lib/artifact-limits";
import { imageHeaderBytes, readImageHeader } from "@/lib/files/image-size-rules";
import { headObject, isR2Configured, presignUpload, r2ConfigFromEnv, readObjectStart, type R2Config } from "@/lib/files/r2";
import type { FileDto } from "@/lib/files/types";
import { assertFileFits } from "@/lib/quota/usage";
import type { Theme } from "@/lib/themes/schema";
import { UserFacingError } from "@/lib/user-facing-error";

import { CaptureNotWantedError } from "./capture-errors";
import {
  captureAvailability,
  captureGeometry,
  captureLimits,
  captureModes,
  captureObjectKey,
  captureTypes,
  countsTowardStorage,
  drawingKey,
  fitsCanvasCap,
  neededDrawings,
  partBox,
  partsProblem,
  type CaptureDrawing,
  type CaptureGeometry,
} from "./capture-rules";
import { boardDrawings, loadCaptureBoard, ThemeUnreadableError, type BoardFrame, type CaptureBoard } from "./captures-board";
import { countPendingCaptures, getOwnPendingCapture, insertPendingCapture, listLiveCaptures, markCaptureReady, removeCapture, removeStaleCaptures } from "./captures-store";

/**
 * Frame captures: images of canvas frames for agents. 1: the tab of someone
 * who may edit the canvas asks capturesNeeded which frames have no image of
 * their current content. 2: it draws one, and startCapture stores a pending
 * capture and returns a presigned PUT for each part. 3: the tab PUTs the
 * parts straight to R2, and finishCapture checks every stored part and makes
 * the capture the current image. Every step checks that the person may edit
 * the canvas; a reader can never plant a picture.
 */

/** The most spec text one needed-list answer carries, in bytes. It always carries at least one frame. */
const maxBatchSpecBytes = 400_000;

/** One frame for the tab to draw, in each mode listed. The tab draws by content, so it gets no frame id. */
export type NeededFrame = Omit<BoardFrame, "id">;

/**
 * What a tab should draw now. "not-now" means nothing can be drawn here
 * (captures are off, storage is not set up, a preview deployment, not a
 * canvas, or the theme could not be read), and the tab stays quiet.
 */
export type CapturesNeeded = { state: "not-now" } | { state: "draw"; theme: Theme; files: FileDto[]; frames: NeededFrame[] };

const notNow: CapturesNeeded = { state: "not-now" };

/** Whether frame captures run here: not switched off, not a preview deployment, and file storage is set up. Read at request time. */
export function capturesAreOn(): boolean {
  return captureAvailability({ FRAME_CAPTURES: process.env.FRAME_CAPTURES, VERCEL_ENV: process.env.VERCEL_ENV }, isR2Configured()) === "on";
}

function assertCapturesOn(): void {
  if (!capturesAreOn()) throw new UserFacingError("Frame images are off here.");
}

async function editableCanvas(userId: string, artifactId: string): Promise<ArtifactRecord | null> {
  const record = await getEditableArtifact(userId, { id: artifactId });
  if (!record) throw new UserFacingError("Artifact not found.");
  return record.kind === "canvas" ? record : null;
}

/** The frames that hold the wanted drawings, each with only those drawings, within the batch's size. */
function batchFrames(board: CaptureBoard, wanted: readonly CaptureDrawing[]): NeededFrame[] {
  const keys = new Set(wanted.map(drawingKey));
  const frames: NeededFrame[] = [];
  let bytes = 0;
  for (const frame of board.frames) {
    const drawings = frame.drawings.filter((drawing) => keys.has(drawingKey(drawing)));
    if (drawings.length === 0) continue;
    // Two frames with the same content share their drawings: the first one carries them.
    for (const drawing of drawings) keys.delete(drawingKey(drawing));
    bytes += byteLength(frame.spec);
    if (frames.length > 0 && bytes > maxBatchSpecBytes) break;
    frames.push({ width: frame.width, height: frame.height, padding: frame.padding, spec: frame.spec, drawings });
  }
  return frames;
}

/**
 * The drawings a canvas needs, for the tab of someone who may edit it: up
 * to `batchDrawings` of them, light ones first, with what the tab needs to
 * draw them (each frame's fields and spec, the theme, and the artifact's
 * files). It also removes captures of content that is no longer on the
 * board. Read from the newest saved content, never from the tab's copy.
 * When captures cannot run here, it answers "not-now" before it reads or
 * writes anything.
 */
export async function capturesNeeded(userId: string, artifactId: string, now: Date = new Date()): Promise<CapturesNeeded> {
  if (!capturesAreOn()) return notNow;
  await enforceRateLimit("frameCaptureNeeded", userId);
  const record = await editableCanvas(userId, artifactId);
  if (!record) return notNow;
  let board: CaptureBoard;
  try {
    board = await loadCaptureBoard(record);
  } catch (error) {
    if (error instanceof ThemeUnreadableError) return notNow;
    throw error;
  }
  const onBoard = boardDrawings(board);
  const current = new Set(onBoard.map(drawingKey));
  const rows = await listLiveCaptures(record.id);
  if (rows.some((row) => !current.has(drawingKey(row)))) await removeStaleCaptures(record.id, onBoard, now);
  const wanted = neededDrawings(onBoard, rows.filter((row) => current.has(drawingKey(row))), now).slice(0, captureLimits.batchDrawings);
  return { state: "draw", theme: board.theme, files: board.files, frames: batchFrames(board, wanted) };
}

export const startCaptureSchema = z.object({
  artifactId: z.string().trim().min(1).max(200),
  frameHash: z.string().regex(/^[0-9a-f]{64}$/, "That is not a frame hash."),
  mode: z.enum(captureModes),
  /** The frame's full height as drawn, in CSS pixels. */
  height: z.number().int().min(1).max(captureLimits.maxRecordedHeight),
  /** True when a picture or diagram could not be drawn. */
  partial: z.boolean(),
  /** Each part's exact size and type, in order. They are signed into the upload URLs. */
  parts: z.array(z.object({ bytes: z.number().int().positive().max(captureLimits.maxPartBytes), contentType: z.enum(captureTypes) })).min(1).max(captureLimits.maxParts),
});

export type StartCaptureInput = z.input<typeof startCaptureSchema>;

/** Where to PUT one part: the URL, and the headers to send exactly. */
export interface PartUpload {
  url: string;
  headers: Record<string, string>;
}

/** A started capture: its id for the finish step, and one upload for each part, in order. */
export interface StartedCapture {
  captureId: string;
  uploads: PartUpload[];
}

async function boardOrRefuse(record: ArtifactRecord): Promise<CaptureBoard> {
  try {
    return await loadCaptureBoard(record);
  } catch (error) {
    if (error instanceof ThemeUnreadableError) throw new UserFacingError("The canvas's theme could not be read. Try again later.");
    throw error;
  }
}

function frameOf(board: CaptureBoard, drawing: CaptureDrawing): BoardFrame | null {
  const key = drawingKey(drawing);
  return board.frames.find((frame) => frame.drawings.some((candidate) => drawingKey(candidate) === key)) ?? null;
}

const changedMessage = "This frame changed, so its image is no longer needed.";

/** Refuses a capture that would put the person or the canvas over a storage limit. */
async function assertRoom(userId: string, record: ArtifactRecord, board: CaptureBoard, drawing: CaptureDrawing, bytes: number, now: Date): Promise<void> {
  // Only images of content that is on the board count: the next needed-list call removes the others.
  const current = new Set(boardDrawings(board).map(drawingKey));
  const rows = (await listLiveCaptures(record.id)).filter((row) => current.has(drawingKey(row)));
  if (rows.some((row) => row.status === "ready" && drawingKey(row) === drawingKey(drawing))) throw new CaptureNotWantedError("This frame already has a current image.");
  if ((await countPendingCaptures(userId, now)) >= captureLimits.maxPendingPerUser) throw new UserFacingError("You have many unfinished frame images. Wait for them to finish, then try again.");
  const used = rows.filter((row) => countsTowardStorage(row, now)).reduce((sum, row) => sum + row.bytes, 0);
  if (!fitsCanvasCap(used, bytes)) throw new UserFacingError("This canvas holds as many frame images as it can.");
  await assertFileFits(userId, bytes);
}

/**
 * Starts a capture of one drawing for `userId`. Refuses when captures are
 * off, when the person may not edit the canvas, when the content is no
 * longer on the board, when the drawing is shorter than the frame's least
 * height, when the parts do not fit the frame's geometry, and
 * over the rate limits, the cap on unfinished captures, the canvas's
 * storage cap, or the person's file storage quota.
 */
export async function startCapture(userId: string, input: StartCaptureInput, now: Date = new Date()): Promise<StartedCapture> {
  const parsed = startCaptureSchema.parse(input);
  assertCapturesOn();
  await enforceRateLimit("frameCaptureStart", userId);
  const record = await editableCanvas(userId, parsed.artifactId);
  if (!record) throw new UserFacingError("Only a canvas has frame images.");
  // After the access check, so someone who may not edit never uses up the canvas's budget.
  await enforceRateLimit("frameCaptureStartByArtifact", record.id);
  const board = await boardOrRefuse(record);
  const frame = frameOf(board, parsed);
  if (!frame) throw new CaptureNotWantedError(changedMessage);
  // The frame is never drawn shorter than the least height it asks for.
  if (frame.height !== null && parsed.height < frame.height) throw new UserFacingError("The drawing is shorter than its frame.");
  const geometry = captureGeometry(frame.width, parsed.height);
  const problem = partsProblem(geometry, parsed.parts);
  if (problem) throw new UserFacingError(problem);
  const bytes = parsed.parts.reduce((sum, part) => sum + part.bytes, 0);
  await assertRoom(userId, record, board, parsed, bytes, now);
  const captureId = randomUUID();
  const contentType = parsed.parts[0]?.contentType ?? captureTypes[0];
  const config = r2ConfigFromEnv();
  const uploads = await Promise.all(
    parsed.parts.map(async (part, index) => {
      const upload = await presignUpload(config, { key: captureObjectKey(record.id, captureId, index + 1), contentType, size: part.bytes, expiresIn: captureLimits.uploadUrlSeconds });
      return { url: upload.url, headers: upload.headers };
    }),
  );
  await insertPendingCapture({
    id: captureId,
    artifactId: record.id,
    mode: parsed.mode,
    frameHash: parsed.frameHash,
    partCount: geometry.partCount,
    columns: geometry.columns,
    width: frame.width,
    height: parsed.height,
    drawnHeight: geometry.drawnHeight,
    contentType,
    bytes,
    partial: parsed.partial,
    capturedBy: userId,
  });
  return { captureId, uploads };
}

/** Why a part's first bytes are not the picture its place in the frame needs, or null when they are. */
function pictureProblem(row: FrameCaptureRecord, geometry: CaptureGeometry, part: number, start: Uint8Array): string | null {
  const header = readImageHeader(start);
  if (header?.type !== row.contentType) return `Part ${String(part)} is not a ${row.contentType} picture.`;
  const box = partBox(geometry, row.width, part);
  if (header.width !== box?.width || header.height !== box.height) return `Part ${String(part)} does not have the size its place in the frame needs.`;
  return null;
}

/** What is wrong with one stored part, or its size in bytes when it is the part the capture describes. */
async function checkPart(config: R2Config, row: FrameCaptureRecord, geometry: CaptureGeometry, part: number): Promise<{ bytes: number } | { problem: string }> {
  const key = captureObjectKey(row.artifactId, row.id, part);
  const stored = await headObject(config, key);
  if (!stored) return { problem: `Part ${String(part)} did not arrive.` };
  if (stored.size <= 0) return { problem: `Part ${String(part)} is empty or could not be read.` };
  if (stored.size > captureLimits.maxPartBytes) return { problem: `Part ${String(part)} is larger than a part can be.` };
  const storedType = (stored.contentType.split(";")[0] ?? "").trim().toLowerCase();
  if (storedType !== row.contentType) return { problem: `Part ${String(part)} is not stored as ${row.contentType}.` };
  const problem = pictureProblem(row, geometry, part, await readObjectStart(config, key, imageHeaderBytes));
  return problem ? { problem } : { bytes: stored.size };
}

/** Why the stored parts are not the capture the row describes, or null when they are. */
async function storedProblem(row: FrameCaptureRecord): Promise<string | null> {
  const config = r2ConfigFromEnv();
  const geometry = captureGeometry(row.width, row.height);
  if (geometry.partCount !== row.partCount) return "The drawing does not match its frame.";
  const parts = await Promise.all(Array.from({ length: row.partCount }, (_, index) => checkPart(config, row, geometry, index + 1)));
  let bytes = 0;
  for (const part of parts) {
    if ("problem" in part) return part.problem;
    bytes += part.bytes;
  }
  return bytes === row.bytes ? null : "The parts are not the size the drawing said.";
}

async function refuseAndRemove(row: FrameCaptureRecord, reason: string, now: Date): Promise<never> {
  await removeCapture(row.id, now);
  throw new UserFacingError(`The frame image was refused and removed. ${reason}`);
}

/**
 * Checks a capture's stored parts and makes it the current image of its
 * content. Only the person who started it can finish it, and only while
 * they may still edit the canvas and the content is still on the board. A
 * capture that fails a check (a missing part, a wrong type, a wrong pixel
 * size, a wrong byte size) is removed. Finish calls are rate limited per
 * person, since each one reads the capture's parts from storage. Returns `current: false` when the
 * parts were fine but the capture was no longer pending by the time it was
 * marked: another capture of the same content finished first.
 */
export async function finishCapture(userId: string, captureId: string, now: Date = new Date()): Promise<{ current: boolean }> {
  const id = z.uuid("That is not a capture id.").parse(captureId);
  assertCapturesOn();
  // Before anything is read: each finish checks the capture's parts in storage.
  await enforceRateLimit("frameCaptureFinish", userId);
  const row = await getOwnPendingCapture(id, userId);
  if (!row) throw new UserFacingError("Frame image not found.");
  const record = await getEditableArtifact(userId, { id: row.artifactId });
  if (record?.kind !== "canvas") {
    await removeCapture(row.id, now);
    throw new UserFacingError("Artifact not found.");
  }
  if (!frameOf(await boardOrRefuse(record), row)) return refuseAndRemove(row, changedMessage, now);
  const problem = await storedProblem(row);
  if (problem) return refuseAndRemove(row, problem, now);
  return { current: await markCaptureReady(row, now) };
}
