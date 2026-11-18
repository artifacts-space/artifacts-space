"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { discardUploadAction, finalizeUploadAction, requestUploadAction } from "@/app/(workspace)/app/file-actions";
import { putFile } from "@/components/files/put-file";
import { fileUrl } from "@/lib/files/types";

import { UploadRequestRefused } from "./media-upload-rules";
import type { MediaUploader } from "./media-uploads";

/**
 * How the editor's media blocks reach the file store: the uploader they
 * send files with and the URL they show a file at. The app uses the normal
 * upload flow (a presigned PUT to R2, then the server checks the file); the
 * save attaches the upload to the artifact. The dev fixture swaps in a
 * stand-in so the editor runs without a database or R2.
 */
export interface EditorMedia {
  upload: MediaUploader;
  urlFor: (fileId: string, download: boolean) => string;
}

/** Removes the upload a cancelled request left unfinished, so it does not wait an hour for the cleanup job. Best effort: the job is the backstop. */
function discardCancelled(fileId: string, signal: AbortSignal | undefined) {
  if (signal?.aborted) void discardUploadAction(fileId).catch(() => undefined);
}

/**
 * Uploads one file through the normal flow; throws with a message for
 * people when a step fails. Aborting `signal` (Cancel) stops the request
 * that carries the bytes and removes the unfinished upload.
 */
export const uploadThroughFileStore: MediaUploader = async (file, onProgress, signal) => {
  const ticket = await requestUploadAction({ filename: file.name, contentType: file.type, size: file.size });
  if (!ticket.success) throw new UploadRequestRefused(ticket.error);
  try {
    await putFile(ticket.data.url, ticket.data.headers, file, onProgress, signal);
  } catch (error) {
    discardCancelled(ticket.data.fileId, signal);
    throw error;
  }
  const ready = await finalizeUploadAction(ticket.data.fileId);
  if (!ready.success) throw new Error(ready.error);
  discardCancelled(ready.data.id, signal);
  const { id, filename, contentType, size, width, height } = ready.data;
  return { id, filename, contentType, size, ...(width && height ? { width, height } : {}) };
};

const defaultMedia: EditorMedia = {
  upload: uploadThroughFileStore,
  urlFor: (fileId, download) => fileUrl(fileId, { download }),
};

const EditorMediaContext = createContext<EditorMedia>(defaultMedia);

/** Replaces how media blocks upload and load files, for the dev fixture only. */
export function EditorMediaProvider({ upload, urlFor, children }: Partial<EditorMedia> & { children: ReactNode }) {
  const value = useMemo<EditorMedia>(() => ({ upload: upload ?? defaultMedia.upload, urlFor: urlFor ?? defaultMedia.urlFor }), [upload, urlFor]);
  return <EditorMediaContext.Provider value={value}>{children}</EditorMediaContext.Provider>;
}

/** The uploader and URL builder media blocks use. */
export function useEditorMedia(): EditorMedia {
  return useContext(EditorMediaContext);
}
