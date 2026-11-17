"use client";

import { useCallback, useState } from "react";

import { deleteFileAction, finalizeUploadAction, requestUploadAction } from "@/app/(workspace)/app/file-actions";
import type { ActionResult } from "@/lib/artifact-types";
import { checkUpload, fileLimits } from "@/lib/files/config";
import type { FileDto } from "@/lib/files/types";

import { putFile } from "./put-file";

/** One file the person picked, from picking to ready. */
export interface UploadItem {
  key: string;
  name: string;
  size: number;
  status: "uploading" | "checking" | "ready" | "error";
  progress: number;
  error: string | null;
  file: FileDto | null;
}

let nextKey = 0;

/** What an upload reports while it runs: bytes sent, then the server checking the file. */
export interface UploadProgress {
  progress: (percent: number) => void;
  checking: () => void;
  /** The upload's id, as soon as the server started it, so a caller can discard an upload that stops part way. */
  started?: (fileId: string) => void;
}

/** What a file past the artifact's limit is told when more are added at once than an artifact holds. */
export const tooManyAtOnce = `An artifact holds at most ${String(fileLimits.maxFilesPerArtifact)} attached files. This one was left out.`;

/** Why this file cannot upload (its size or type), or null when it can. */
function uploadProblem(file: File): string | null {
  const check = checkUpload({ filename: file.name, contentType: file.type, size: file.size });
  return check.ok ? null : check.error;
}

/** Sends one file and returns it once the server has checked it. */
export type SendFile = (file: File, report: UploadProgress) => Promise<ActionResult<FileDto>>;

/** The real upload: ask the server for a presigned PUT, send the bytes to R2, then have the server check the file. */
export const sendToServer: SendFile = async (file, report) => {
  const ticket = await requestUploadAction({ filename: file.name, contentType: file.type, size: file.size });
  if (!ticket.success) return ticket;
  report.started?.(ticket.data.fileId);
  await putFile(ticket.data.url, ticket.data.headers, file, report.progress);
  report.checking();
  return finalizeUploadAction(ticket.data.fileId);
};

/**
 * Uploads picked files one request each: ask the server for a presigned PUT,
 * send the bytes to R2 with progress, then have the server check the file.
 * Each file succeeds or fails on its own. `onReady` runs for each finished
 * file. `send` replaces the upload (the /dev/workspace fixture's stand-in).
 */
export function useFileUploads(options: { onReady?: (file: FileDto, key: string) => void; send?: SendFile | undefined } = {}) {
  const { onReady, send = sendToServer } = options;
  const [items, setItems] = useState<UploadItem[]>([]);

  const patch = useCallback((key: string, change: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }, []);

  const upload = useCallback(async (key: string, file: File) => {
    const fail = (error: string) => { patch(key, { status: "error", error }); };
    try {
      const ready = await send(file, {
        progress: (progress) => { patch(key, { progress }); },
        checking: () => { patch(key, { status: "checking", progress: 100 }); },
      });
      if (!ready.success) { fail(ready.error); return; }
      patch(key, { status: "ready", file: ready.data });
      onReady?.(ready.data, key);
    } catch (error) {
      fail(error instanceof Error ? error.message : "The upload failed. Try again.");
    }
  }, [onReady, patch, send]);

  const addFiles = useCallback((files: readonly File[]) => {
    // Every file gets a row: one past what an artifact holds says so, and none goes with no word. The server decides for real when a file is attached.
    const added = files.map((file, index) => {
      nextKey += 1;
      const problem = index < fileLimits.maxFilesPerArtifact ? uploadProblem(file) : tooManyAtOnce;
      const item: UploadItem = { key: `upload-${String(nextKey)}`, name: file.name, size: file.size, status: problem ? "error" : "uploading", progress: 0, error: problem, file: null };
      return { item, file, ok: problem === null };
    });
    setItems((current) => [...current, ...added.map(({ item }) => item)]);
    for (const { item, file, ok } of added) if (ok) void upload(item.key, file);
  }, [upload]);

  /** Drops a file from the list, deleting its upload when it finished and was not attached elsewhere. */
  const remove = useCallback((key: string, removeOptions: { deleteUpload: boolean } = { deleteUpload: true }) => {
    const target = items.find((item) => item.key === key);
    if (removeOptions.deleteUpload && target?.file) void deleteFileAction(target.file.id).catch(() => undefined);
    setItems((current) => current.filter((item) => item.key !== key));
  }, [items]);

  /** Clears the list. With `deleteUploads`, finished uploads are deleted too (they were not used). */
  const reset = useCallback((resetOptions: { deleteUploads: boolean } = { deleteUploads: false }) => {
    if (resetOptions.deleteUploads) {
      for (const item of items) if (item.file) void deleteFileAction(item.file.id).catch(() => undefined);
    }
    setItems([]);
  }, [items]);

  /** Shows finished files as being checked again (an answer about them was lost); they count as busy until removed. */
  const markChecking = useCallback((fileIds: readonly string[]) => {
    setItems((current) => current.map((item) => (item.file && fileIds.includes(item.file.id) ? { ...item, status: "checking" } : item)));
  }, []);

  /** Shows a file as refused, with the reason: one that uploaded but could not be attached. Its row keeps Remove, which deletes the upload. */
  const fail = useCallback((key: string, error: string) => { patch(key, { status: "error", error }); }, [patch]);

  const readyFiles = items.flatMap((item) => (item.status === "ready" && item.file ? [item.file] : []));
  const busy = items.some((item) => item.status === "uploading" || item.status === "checking");
  return { items, addFiles, remove, reset, markChecking, fail, readyFiles, busy };
}
