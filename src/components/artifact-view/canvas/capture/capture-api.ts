import { finishFrameCaptureAction, frameCapturesNeededAction, startFrameCaptureAction, type StartCaptureAnswer } from "@/app/(workspace)/app/frame-capture-actions";
import type { ActionResult } from "@/lib/artifact-types";
import type { CapturesNeeded, PartUpload, StartCaptureInput } from "@/lib/canvas/captures";
import { fileUrl, type FileDto } from "@/lib/files/types";

import { partUploadTimeoutMs } from "./capture-host-rules";

/**
 * What the capture host (frame-capture-host.tsx) calls: the server actions,
 * which check the session and the edit access on every call, and a PUT
 * straight to file storage; or a fixture's stand-in, which needs neither
 * (the /dev/canvas page). The host never reaches the server another way.
 */
export interface CaptureApi {
  /** Which drawings the canvas needs now, with what the tab needs to draw them. */
  needed: (artifactId: string) => Promise<ActionResult<CapturesNeeded>>;
  /** Starts one capture: the answer holds one upload for each part, or says the drawing is no longer wanted. */
  start: (input: StartCaptureInput) => Promise<ActionResult<StartCaptureAnswer>>;
  /** Sends one part to its upload. False when it did not arrive. Never throws. */
  upload: (upload: PartUpload, part: Blob) => Promise<boolean>;
  /** Has the server check the uploaded parts and make the capture current. */
  finish: (captureId: string) => Promise<ActionResult<{ current: boolean }>>;
  /** Where the host fetches a picture a frame shows: the same URL the page uses. */
  pictureUrl: (file: FileDto) => string;
}

/**
 * PUTs one part to its signed URL with the headers the server signed. The
 * browser sets Content-Length itself, from the part's size, which is the
 * size that was signed (as put-file.ts does). No cookies go to file storage.
 * An upload that takes longer than `partUploadTimeoutMs` counts as failed,
 * so a connection that stalls never holds the pass.
 */
async function putPart(upload: PartUpload, part: Blob): Promise<boolean> {
  try {
    const headers = Object.fromEntries(Object.entries(upload.headers).filter(([name]) => name.toLowerCase() !== "content-length"));
    const response = await fetch(upload.url, { method: "PUT", headers, body: part, credentials: "omit", signal: AbortSignal.timeout(partUploadTimeoutMs) });
    return response.ok;
  } catch {
    return false;
  }
}

/** The server actions and file storage. */
export const serverCaptureApi: CaptureApi = {
  needed: (artifactId) => frameCapturesNeededAction(artifactId),
  start: (input) => startFrameCaptureAction(input),
  upload: putPart,
  finish: (captureId) => finishFrameCaptureAction(captureId),
  pictureUrl: (file) => fileUrl(file.id, { replacedAt: file.replacedAt }),
};
