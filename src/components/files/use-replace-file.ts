"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { ActionResult, ArtifactDto } from "@/lib/artifact-types";
import { checkUpload } from "@/lib/files/config";
import type { FileDto } from "@/lib/files/types";

import type { SendFile } from "./use-file-uploads";

/** What replacing needs: send the new file, swap it in, and discard an upload that was not used. */
export interface ReplaceFileApi {
  send: SendFile;
  replace: (artifactId: string, fileId: string, uploadId: string) => Promise<ActionResult<ArtifactDto>>;
  discard: (fileId: string) => Promise<unknown>;
}

/** The file being replaced, and how far its upload got. */
export interface Replacing {
  fileId: string;
  progress: number;
  checking: boolean;
}

/** Deletes an upload that did not become the file. Guarded on the server: a file already in an artifact is left alone. */
function discardQuietly(api: ReplaceFileApi, uploadId: string | null) {
  if (uploadId) void api.discard(uploadId).catch(() => undefined);
}

/**
 * Replaces one file of an artifact at a time: uploads the picked file,
 * then swaps it in under the same entry. When the upload is refused, the
 * replace is refused, or an answer is lost, the upload is discarded (the
 * server keeps it only if it already became the file) and the current file
 * stays as it was.
 */
export function useReplaceFile({ artifactId, api, onUpdated }: { artifactId: string; api: ReplaceFileApi; onUpdated: (artifact: ArtifactDto) => void }) {
  const [replacing, setReplacing] = useState<Replacing | null>(null);

  const replace = useCallback(async (target: FileDto, picked: File) => {
    const check = checkUpload({ filename: picked.name, contentType: picked.type, size: picked.size });
    if (!check.ok) { toast.error(check.error); return; }
    setReplacing({ fileId: target.id, progress: 0, checking: false });
    let uploadId: string | null = null;
    try {
      const sent = await api.send(picked, {
        progress: (progress) => { setReplacing((current) => (current ? { ...current, progress } : current)); },
        checking: () => { setReplacing((current) => (current ? { ...current, progress: 100, checking: true } : current)); },
        started: (fileId) => { uploadId = fileId; },
      });
      if (!sent.success) { toast.error(sent.error); discardQuietly(api, uploadId); return; }
      uploadId = sent.data.id;
      const result = await api.replace(artifactId, target.id, sent.data.id);
      if (!result.success) { toast.error(result.error); discardQuietly(api, uploadId); return; }
      onUpdated(result.data);
      toast.success(`Replaced ${target.filename}. The old copy is in History.`);
    } catch {
      discardQuietly(api, uploadId);
      toast.error("The file could not be replaced. Check your connection and try again.");
    } finally {
      setReplacing(null);
    }
  }, [api, artifactId, onUpdated]);

  return { replacing, replace };
}
