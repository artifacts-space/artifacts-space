import { prepareImage } from "@/components/images/prepare-image";
import { fileLimits, formatBytes } from "@/lib/files/config";
import { animationBytes, documentPrepareProfile, isAnimatedImage, uploadsUnprepared } from "@/lib/images/prepare-rules";

import { filenameFromUrl, maxUploadsAtOnce, mediaUploadProblem, uploadMediaKind } from "./media-upload-rules";

/**
 * Uploads that media blocks wait for, in this browser. A block stores only
 * an upload id (see MediaAttrs); the File and its progress live here, out of
 * the document, so the document stays plain JSON that collaborators can
 * share. The block's view starts the upload with the page's uploader (see
 * media-context.tsx) and writes the file's URL into the block when it ends.
 */

/** A finished upload: what the block needs to show it. The size, and an image's pixel size, are there when the file store gave them. */
export interface UploadedMedia {
  id: string;
  filename: string;
  contentType: string;
  size?: number;
  width?: number;
  height?: number;
}

/** Sends one file to the file store and returns it once it is ready. Aborting `signal` stops the request that carries the bytes. */
export type MediaUploader = (file: File, onProgress: (percent: number) => void, signal?: AbortSignal) => Promise<UploadedMedia>;

/** Where one upload is. */
export type UploadState =
  | { status: "waiting" }
  | { status: "preparing" }
  | { status: "uploading"; progress: number }
  | { status: "done"; file: UploadedMedia }
  | { status: "failed"; message: string };

interface Entry {
  file: File;
  /** Why this file can never upload (its size or type, or a document that is full), so Try again is not offered. */
  refused: string | null;
  /** A local URL of the picked image, made on first use and released with the entry. */
  preview: string | null;
  state: UploadState;
  started: boolean;
  /** Stops the request of the run in progress. A retry gets a new one. */
  stop: AbortController;
  listeners: Set<() => void>;
}

const entries = new Map<string, Entry>();
/** The uploads this tab finished, by file id: a block shows its file's type and size before any save lists the file. */
const finished = new Map<string, UploadedMedia>();

/** What this tab's own upload of `fileId` said about the file, or null when it was uploaded elsewhere. */
export function uploadedFacts(fileId: string): UploadedMedia | null {
  return finished.get(fileId.toLowerCase()) ?? null;
}
let nextId = 0;
const missing: UploadState = { status: "failed", message: "This upload was started in another tab or before a reload. Upload the file again." };

function setState(uploadId: string, state: UploadState) {
  const entry = entries.get(uploadId);
  if (!entry) return;
  entry.state = state;
  for (const listener of entry.listeners) listener();
}

/**
 * Keeps `file` for a new media block and returns the upload id the block
 * stores. With `refusal` (a document that is full) the file never uploads:
 * its block shows the reason and Remove.
 */
export function queueUpload(file: File, refusal: string | null = null): string {
  nextId += 1;
  const uploadId = `upload-${String(Date.now())}-${String(nextId)}`;
  const refused = refusal ?? mediaUploadProblem(file);
  entries.set(uploadId, { file, refused, preview: null, state: refused ? { status: "failed", message: refused } : { status: "waiting" }, started: Boolean(refused), stop: new AbortController(), listeners: new Set() });
  return uploadId;
}

/** True when the upload can be tried again: its file is here, and nothing about the file or the document rules it out. */
export function canRetryUpload(uploadId: string): boolean {
  return entries.get(uploadId)?.refused === null;
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

/** Whether a picked image moves: a redraw would keep only its first frame. A file that cannot be read counts as a still. */
async function isAnimated(file: File): Promise<boolean> {
  if (file.size > documentPrepareProfile.maxBytes) return false;
  try {
    return isAnimatedImage(file.type, new Uint8Array(await file.slice(0, animationBytes).arrayBuffer()));
  } catch {
    return false;
  }
}

/** Still images are redrawn first (upright, at most 2400 px, camera data dropped); a GIF, an animated image, and every other file upload as they are. */
async function prepared(file: File): Promise<File> {
  if (uploadMediaKind(file) !== "image" || uploadsUnprepared(file, documentPrepareProfile)) return file;
  if (await isAnimated(file)) return file;
  return prepareImage(file, documentPrepareProfile);
}

async function run(uploadId: string, entry: Entry, uploader: MediaUploader) {
  try {
    setState(uploadId, { status: "preparing" });
    const ready = await prepared(entry.file);
    setState(uploadId, { status: "uploading", progress: 0 });
    const file = await uploader(ready, (progress) => { setState(uploadId, { status: "uploading", progress }); }, entry.stop.signal);
    finished.set(file.id.toLowerCase(), file);
    setState(uploadId, { status: "done", file });
  } catch (error) {
    setState(uploadId, { status: "failed", message: error instanceof Error && error.message ? error.message : "The upload failed. Try again." });
  }
}

/** Uploads that wait for one of the tab's few places (maxUploadsAtOnce), first come first served. */
const waiting: (() => Promise<void>)[] = [];
let running = 0;

/** Starts waiting uploads while a place is free. Each one that ends frees its place for the next. */
function pump() {
  while (running < maxUploadsAtOnce) {
    const next = waiting.shift();
    if (!next) return;
    running += 1;
    void next().finally(() => {
      running -= 1;
      pump();
    });
  }
}

/**
 * Starts the upload once, however many views ask; a view mounted again
 * later picks up where it is. A few upload at a time and the rest wait in
 * their blocks ("Waiting to upload…"). An upload whose block was removed
 * while it waited gives its place straight to the next.
 */
export function startUpload(uploadId: string, uploader: MediaUploader): void {
  const entry = entries.get(uploadId);
  if (!entry || entry.started) return;
  entry.started = true;
  waiting.push(() => (entries.get(uploadId) === entry ? run(uploadId, entry, uploader) : Promise.resolve()));
  pump();
}

/** Tries a failed upload again. */
export function retryUpload(uploadId: string, uploader: MediaUploader): void {
  const entry = entries.get(uploadId);
  if (entry?.state.status !== "failed" || entry.refused !== null) return;
  entry.started = false;
  entry.stop = new AbortController();
  setState(uploadId, { status: "waiting" });
  startUpload(uploadId, uploader);
}

/** Forgets an upload whose block is gone, and stops its request when it is still on its way (Cancel). */
export function forgetUpload(uploadId: string): void {
  const entry = entries.get(uploadId);
  if (!entry) return;
  if (entry.preview) URL.revokeObjectURL(entry.preview);
  entries.delete(uploadId);
  entry.stop.abort();
}

/** What a linked file is told when it is larger than a file may be and its size is only known by reading it. */
const linkedFileTooLarge = `That file is too large. The limit is ${formatBytes(fileLimits.maxBytes)}.`;

/**
 * Reads a response's body up to `limit` bytes. One byte more and the read
 * stops and the request is cancelled, so a site that states no length, or
 * a wrong one, cannot make the tab hold a file of any size.
 */
async function boundedBody(response: Response, limit: number): Promise<Blob> {
  const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  const reader = response.body?.getReader();
  if (!reader) return new Blob([], { type });
  const parts: BlobPart[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      throw new Error(linkedFileTooLarge);
    }
    parts.push(value);
  }
  return new Blob(parts, { type });
}

/**
 * Fetches a file from a link in the browser, so it can be uploaded here:
 * images then load from this site's file store, never from the other site.
 * The fetch sends no cookies and no referrer. Many sites refuse it (CORS);
 * the error says what to do instead. A file over the size limit is refused:
 * at once when the site states its length, and otherwise as soon as the
 * read passes the limit (boundedBody), never after the whole download.
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
  if (declared > fileLimits.maxBytes) {
    // The answer is known without the body: let the request go.
    void response.body?.cancel().catch(() => undefined);
    throw new Error(`That file is ${formatBytes(declared)}. The limit is ${formatBytes(fileLimits.maxBytes)}.`);
  }
  const blob = await boundedBody(response, fileLimits.maxBytes);
  return new File([blob], filenameFromUrl(url), { type: blob.type });
}
