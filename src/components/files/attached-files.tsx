"use client";

import { IconExternalLink, IconFile, IconLoader2, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import { attachFilesAction, deleteFileAction } from "@/app/(workspace)/app/file-actions";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import type { ActionResult, ArtifactDto } from "@/lib/artifact-types";
import { formatBytes, fileTypeLabel } from "@/lib/files/config";
import { fileUrl, type FileDto } from "@/lib/files/types";

import { FileUploader } from "./file-uploader";
import { useFileUploads, type SendFile } from "./use-file-uploads";

/** Where the section uploads and attaches files: the server actions, or the /dev/workspace fixture's stand-in. */
export interface AttachFilesApi {
  send: SendFile;
  attach: (artifactId: string, fileIds: string[]) => Promise<ActionResult<ArtifactDto>>;
}

/** One attached file: name, type and size, and open, copy-id, and remove actions. */
function AttachedRow({ file, showId, removing, onRemove }: { file: FileDto; showId: boolean; removing: boolean; onRemove: () => void }) {
  return (
    <li className="card-nested flex min-w-0 items-center gap-3 bg-card px-3 py-2">
      <IconFile aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{file.filename}</span>
        <span className="text-xs text-muted-foreground">{fileTypeLabel(file.contentType)} · {formatBytes(file.size)}</span>
      </span>
      {showId ? <CopyButton value={file.id} label="Copy id" variant="ghost" size="xs" /> : null}
      <Button variant="ghost" size="icon-xs" nativeButton={false} render={<a href={fileUrl(file.id)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${file.filename}`} />}>
        <IconExternalLink />
      </Button>
      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${file.filename}`} disabled={removing} onClick={onRemove}>
        {removing ? <IconLoader2 className="animate-spin" /> : <IconTrash />}
      </Button>
    </li>
  );
}

/**
 * The editor's files section: the artifact's attached files, and an uploader
 * that attaches each file as soon as it finishes. In a ui artifact, copy a
 * file's id into an Image or File element.
 */
export function AttachedFiles({ artifact, onUpdated, api }: { artifact: ArtifactDto; onUpdated: (artifact: ArtifactDto) => void; api?: AttachFilesApi | undefined }) {
  const [removing, setRemoving] = useState<string | null>(null);
  const attach = api?.attach ?? attachFilesAction;
  const uploads = useFileUploads({
    send: api?.send,
    onReady: (file, key) => {
      void attach(artifact.id, [file.id])
        .then((result) => {
          if (!result.success) { toast.error(result.error); return; }
          onUpdated(result.data);
          uploads.remove(key, { deleteUpload: false });
        })
        .catch(() => { toast.error("The file could not be added. Try again."); });
    },
  });

  async function remove(file: FileDto) {
    setRemoving(file.id);
    try {
      const result = await deleteFileAction(file.id);
      if (!result.success) { toast.error(result.error); return; }
      if (result.data) onUpdated(result.data);
      toast.success("File removed.");
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section aria-label="Files" className="flex flex-col gap-3 border-t bg-background/60 px-5 py-4 sm:px-7">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-md font-medium">Files</h2>
        <span className="text-xs text-muted-foreground">{artifact.files.length === 0 ? "None yet" : `${String(artifact.files.length)} attached`}</span>
      </div>
      {artifact.files.length > 0 ? (
        <ul className="flex min-w-0 flex-col gap-2">
          {artifact.files.map((file) => (
            <AttachedRow key={file.id} file={file} showId={artifact.kind === "ui"} removing={removing === file.id} onRemove={() => void remove(file)} />
          ))}
        </ul>
      ) : null}
      <FileUploader items={uploads.items} onFiles={uploads.addFiles} onRemove={(key) => { uploads.remove(key); }} />
    </section>
  );
}
