import { prepareImage } from "@/components/images/prepare-image";
import { fileLimits, formatBytes } from "@/lib/files/config";
import { documentPrepareProfile, uploadsUnprepared } from "@/lib/images/prepare-rules";

import { filenameFromUrl, mediaUploadProblem, uploadMediaKind } from "./media-upload-rules";

/**
 * Uploads that media blocks wait for, in this browser. A block stores only
 * an upload id (see MediaAttrs); the File and its progress live here, out of
 * the document, so the document stays plain JSON that collaborators can
 * share. The block's view starts the upload with the page's uploader (see
 * media-context.tsx) and writes the file's URL into the block when it ends.
 */

/** A finished upload: what the block needs to show it. */
export interface UploadedMedia {
  id: string;
  filename: string;
  contentType: string;
}

/** Sends one file to the file store and returns it once it is ready. */
export type MediaUploader = (file: File, onProgress: (percent: number) => void) => Promise<UploadedMedia>;

/** Where one upload is. */
export type UploadState =
  | { status: "waiting" }
  | { status: "preparing" }
  | { status: "uploading"; progress: number }
  | { status: "done"; file: UploadedMedia }
  | { status: "failed"; message: string };

interface Entry {
  file: File;
  /** A local URL of the picked image, made on first use and released with the entry. */
  preview: string | null;
  state: UploadState;
  started: boolean;
  listeners: Set<() => void>;
}

const entries = new Map<string, Entry>();
let nextId = 0;
const missing: UploadState = { status: "failed", message: "This upload was started in another tab or before a reload. Upload the file again." };

function setState(uploadId: string, state: UploadState) {
  const entry = entries.get(uploadId);
  if (!entry) return;
  entry.state = state;
  for (const listener of entry.listeners) listener();
}

/** Keeps `file` for a new media block and returns the upload id the block stores. */
export function queueUpload(file: File): string {
  nextId += 1;
  const uploadId = `upload-${String(Date.now())}-${String(nextId)}`;
  const problem = mediaUploadProblem(file);
  entries.set(uploadId, { file, preview: null, state: problem ? { status: "failed", message: problem } : { status: "waiting" }, started: Boolean(problem), listeners: new Set() });
  return uploadId;
}

/** The picked file of an upload, for a preview while it uploads. */
export function uploadFile(uploadId: string): File | null {
  return entries.get(uploadId)?.file ?? null;
}

/** A local URL that shows the picked image while it uploads, or null for other files. */
export function uploadPreviewUrl(uploadId: string): string | null {
  const entry = entries.get(uploadId);
  if (!entry || uploadMediaKind(entry.file) !== "image") return null;
  entry.preview ??= URL.createObjectURL(entry.file);
  return entry.preview;
}

/** Where an upload is. An id this browser never queued reads as failed. */
export function uploadState(uploadId: string): UploadState {
  return entries.get(uploadId)?.state ?? missing;
}

/** Calls `listener` whenever the upload moves on; returns the unsubscribe. For useSyncExternalStore. */
export function subscribeUpload(uploadId: string, listener: () => void): () => void {
  const entry = entries.get(uploadId);
  entry?.listeners.add(listener);
  return () => { entry?.listeners.delete(listener); };
}

/** Images are redrawn first (upright, at most 2400 px, camera data dropped); everything else uploads as it is. */
async function prepared(file: File): Promise<File> {
  if (uploadMediaKind(file) !== "image" || uploadsUnprepared(file, documentPrepareProfile)) return file;
  return prepareImage(file, documentPrepareProfile);
}

async function run(uploadId: string, entry: Entry, uploader: MediaUploader) {
  try {
    setState(uploadId, { status: "preparing" });
    const ready = await prepared(entry.file);
    setState(uploadId, { status: "uploading", progress: 0 });
    const file = await uploader(ready, (progress) => { setState(uploadId, { status: "uploading", progress }); });
    setState(uploadId, { status: "done", file });
  } catch (error) {
    setState(uploadId, { status: "failed", message: error instanceof Error && error.message ? error.message : "The upload failed. Try again." });
  }
}

/** Starts the upload once, however many views ask; a view mounted again later picks up where it is. */
export function startUpload(uploadId: string, uploader: MediaUploader): void {
  const entry = entries.get(uploadId);
  if (!entry || entry.started) return;
  entry.started = true;
  void run(uploadId, entry, uploader);
}

/** Tries a failed upload again. */
export function retryUpload(uploadId: string, uploader: MediaUploader): void {
  const entry = entries.get(uploadId);
  if (entry?.state.status !== "failed" || mediaUploadProblem(entry.file)) return;
  entry.started = false;
  setState(uploadId, { status: "waiting" });
  startUpload(uploadId, uploader);
}

/** Forgets an upload whose block is gone. */
export function forgetUpload(uploadId: string): void {
  const preview = entries.get(uploadId)?.preview;
  if (preview) URL.revokeObjectURL(preview);
  entries.delete(uploadId);
}

/**
 * Fetches a file from a link in the browser, so it can be uploaded here:
 * images then load from this site's file store, never from the other site.
 * The fetch sends no cookies and no referrer. Many sites refuse it (CORS);
 * the error says what to do instead.
 */
export async function fetchFromLink(url: string): Promise<File> {
  let response: Response;
  try {
    response = await fetch(url, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer", redirect: "follow" });
  } catch {
    throw new Error("That site does not let other pages copy its files. Download the file, then upload it here.");
  }
  if (!response.ok) throw new Error(`That link answered with an error (${String(response.status)}). Check the link and try again.`);
  const declared = Number(response.headers.get("content-length"));
  if (declared > fileLimits.maxBytes) throw new Error(`That file is ${formatBytes(declared)}. The limit is ${formatBytes(fileLimits.maxBytes)}.`);
  const blob = await response.blob();
  return new File([blob], filenameFromUrl(url), { type: blob.type });
}
