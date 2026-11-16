import type { CapturesNeeded, NeededFrame } from "@/lib/canvas/captures";
import type { CaptureDrawing } from "@/lib/canvas/capture-rules";
import type { FileDto } from "@/lib/files/types";
import { themeFontAssets } from "@/lib/themes/style";

import type { CaptureApi } from "./capture-api";
import type { BoxElements, BoxJob } from "./capture-box";
import { drawParts, type DrawnParts } from "./capture-draw";
import { asksAgain, attemptKey, picturesInSpec, planDrawing, untriedDrawings, type DrawingPlan, type FrameDrawing } from "./capture-host-rules";
import { loadPictures, type FramePictures, type PictureCache } from "./capture-pictures";
import { nextFrame, waitUntilReady } from "./capture-ready";

/**
 * One pass of the capture host: ask the server which drawings the canvas
 * needs, draw each one in the capture box, upload its parts, and ask again,
 * until the answer holds nothing this pass has not tried. Loaded on the
 * first pass, so pages that never draw do not pay for it. A pass never
 * throws and never logs: a drawing that fails is left for the next pass.
 */

/** What a pass needs from the host component. */
export interface PassEnv {
  api: CaptureApi;
  artifactId: string;
  /** Draws the box for a job (or draws it again, cut to a height) and resolves with its elements, or null when the host is gone. */
  show: (job: BoxJob) => Promise<BoxElements | null>;
  /** Takes the box away. */
  hide: () => void;
  /** False once the host is gone, the tab is hidden, or the window became too narrow: the pass stops. */
  mayContinue: () => boolean;
  /** Resolves when the browser is idle, so drawing never competes with typing. */
  idle: () => Promise<void>;
}

/** done: uploaded. skip: left out, the pass goes on. stop: the pass ends. */
type Outcome = "done" | "skip" | "stop";

let boxCount = 0;

function newJob(frame: NeededFrame, drawing: CaptureDrawing, board: Extract<CapturesNeeded, { state: "draw" }>, pictures: FramePictures): BoxJob {
  boxCount += 1;
  return { key: `capture-${String(boxCount)}`, step: 1, width: frame.width, height: frame.height, padding: frame.padding, spec: frame.spec, mode: drawing.mode, theme: board.theme, files: board.files, pictures: pictures.urls, clipHeight: null };
}

/** Uploads a started capture's parts and has the server check them. */
async function send(env: PassEnv, captureId: string, uploads: readonly { url: string; headers: Record<string, string> }[], drawn: DrawnParts): Promise<Outcome> {
  if (uploads.length !== drawn.parts.length) return "stop";
  for (const [index, upload] of uploads.entries()) {
    const part = drawn.parts[index];
    // Storage that refuses a part would refuse the next one too: the pass ends, and the unfinished capture expires.
    if (!part || !(await env.api.upload(upload, part))) return "stop";
  }
  // A refusal here is the server's call (the frame changed meanwhile, say); the next pass draws what is needed then.
  await env.api.finish(captureId);
  return "done";
}

async function startAndSend(env: PassEnv, drawing: CaptureDrawing, plan: DrawingPlan, partial: boolean, drawn: DrawnParts): Promise<Outcome> {
  const started = await env.api.start({ artifactId: env.artifactId, frameHash: drawing.frameHash, mode: drawing.mode, height: plan.height, partial, parts: drawn.parts.map((part) => ({ bytes: part.size, contentType: drawn.type })) });
  // A refused start is a limit, the canvas's storage cap, or captures turned off: nothing more would start.
  if (!started.success) return "stop";
  if (started.data.state === "not-wanted") return "skip";
  return send(env, started.data.captureId, started.data.uploads, drawn);
}

/** Draws one job's box once it is ready, and sends it. */
async function drawAndSend(env: PassEnv, job: BoxJob, drawing: CaptureDrawing, picturesFailed: boolean): Promise<Outcome> {
  const box = await env.show(job);
  if (!box) return "stop";
  const ready = await waitUntilReady(box.body, themeFontAssets(job.theme).stylesheets);
  // A tab that went to the background stops drawing frames; what is there now is not a finished drawing.
  if (!env.mayContinue()) return "stop";
  const plan = planDrawing(job.width, box.body.getBoundingClientRect().height);
  const cut = await env.show({ ...job, step: job.step + 1, clipHeight: plan.drawnHeight });
  if (!cut) return "stop";
  await nextFrame();
  const drawn = await drawParts(cut.clip, job.width, plan);
  if (!drawn) return "skip";
  return startAndSend(env, drawing, plan, picturesFailed || ready.pictureFailed || !ready.settled, drawn);
}

async function captureOne(env: PassEnv, board: Extract<CapturesNeeded, { state: "draw" }>, item: FrameDrawing<NeededFrame>, files: ReadonlyMap<string, FileDto>, cache: PictureCache): Promise<Outcome> {
  try {
    const pictures = await loadPictures(picturesInSpec(item.frame.spec, new Set(files.keys())), files, env.api, cache);
    if (!env.mayContinue()) return "stop";
    return await drawAndSend(env, newJob(item.frame, item.drawing, board, pictures), item.drawing, pictures.failed);
  } catch {
    // The drawing library or the browser failed on this frame. The next pass tries it again.
    return "skip";
  } finally {
    env.hide();
  }
}

/** Draws every drawing of a batch this pass has not tried. False when the pass must end. */
async function drawBatch(env: PassEnv, board: Extract<CapturesNeeded, { state: "draw" }>, fresh: readonly FrameDrawing<NeededFrame>[], tried: Set<string>, cache: PictureCache): Promise<boolean> {
  const files = new Map(board.files.map((file) => [file.id, file]));
  for (const item of fresh) {
    tried.add(attemptKey(item.drawing));
    await env.idle();
    if (!env.mayContinue()) return false;
    if ((await captureOne(env, board, item, files, cache)) === "stop") return false;
  }
  return true;
}

/** Runs one pass. Resolves when it ends; never rejects. */
export async function runPass(env: PassEnv): Promise<void> {
  const tried = new Set<string>();
  const cache: PictureCache = new Map();
  try {
    for (let batch = 1; env.mayContinue(); batch += 1) {
      const answer = await env.api.needed(env.artifactId);
      if (!answer.success || answer.data.state !== "draw") return;
      const fresh = untriedDrawings(answer.data.frames, tried);
      if (!(await drawBatch(env, answer.data, fresh, tried, cache))) return;
      if (!asksAgain(batch, fresh.length > 0)) return;
    }
  } catch {
    // A lost connection or a failed action: the next pass starts over.
  } finally {
    env.hide();
  }
}
