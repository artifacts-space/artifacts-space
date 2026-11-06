"use client";

import { useCallback, useState } from "react";

import { deleteFileAction, finalizeUploadAction, requestUploadAction } from "@/app/(workspace)/app/file-actions";
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

/**
 * Uploads picked files one request each: ask the server for a presigned PUT,
 * send the bytes to R2 with progress, then have the server check the file.
 * Each file succeeds or fails on its own. `onReady` runs for each finished file.
 */
export function useFileUploads(options: { onReady?: (file: FileDto, key: string) => void } = {}) {
  const { onReady } = options;
  const [items, setItems] = useState<UploadItem[]>([]);

  const patch = useCallback((key: string, change: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }, []);

  const upload = useCallback(async (key: string, file: File) => {
    const fail = (error: string) => { patch(key, { status: "error", error }); };
    try {
      const ticket = await requestUploadAction({ filename: file.name, contentType: file.type, size: file.size });
      if (!ticket.success) { fail(ticket.error); return; }
      await putFile(ticket.data.url, ticket.data.headers, file, (progress) => { patch(key, { progress }); });
      patch(key, { status: "checking", progress: 100 });
      const ready = await finalizeUploadAction(ticket.data.fileId);
      if (!ready.success) { fail(ready.error); return; }
      patch(key, { status: "ready", file: ready.data });
      onReady?.(ready.data, key);
    } catch (error) {
      fail(error instanceof Error ? error.message : "The upload failed. Try again.");
    }
  }, [onReady, patch]);

  const addFiles = useCallback((files: readonly File[]) => {
    const added = files.slice(0, fileLimits.maxFilesPerArtifact).map((file) => {
      nextKey += 1;
      const check = checkUpload({ filename: file.name, contentType: file.type, size: file.size });
      const item: UploadItem = { key: `upload-${String(nextKey)}`, name: file.name, size: file.size, status: check.ok ? "uploading" : "error", progress: 0, error: check.ok ? null : check.error, file: null };
      return { item, file, ok: check.ok };
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

  const readyFiles = items.flatMap((item) => (item.status === "ready" && item.file ? [item.file] : []));
  const busy = items.some((item) => item.status === "uploading" || item.status === "checking");
  return { items, addFiles, remove, reset, readyFiles, busy };
}
