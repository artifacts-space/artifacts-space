"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { finalizeUploadAction, requestUploadAction } from "@/app/(workspace)/app/file-actions";
import { putFile } from "@/components/files/put-file";
import { fileUrl } from "@/lib/files/types";

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

/** Uploads one file through the normal flow; throws with a message for people when a step fails. */
export const uploadThroughFileStore: MediaUploader = async (file, onProgress) => {
  const ticket = await requestUploadAction({ filename: file.name, contentType: file.type, size: file.size });
  if (!ticket.success) throw new Error(ticket.error);
  await putFile(ticket.data.url, ticket.data.headers, file, onProgress);
  const ready = await finalizeUploadAction(ticket.data.fileId);
  if (!ready.success) throw new Error(ready.error);
  return { id: ready.data.id, filename: ready.data.filename, contentType: ready.data.contentType };
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
