"use client";

import { IconExternalLink, IconFile, IconLoader2, IconReplace, IconTrash } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { attachFilesAction, deleteFileAction, discardUploadAction, replaceFileAction } from "@/app/(workspace)/app/file-actions";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import type { ActionResult, ArtifactDto } from "@/lib/artifact-types";
import { fileInputAccept, formatBytes, fileTypeLabel } from "@/lib/files/config";
import { offersReplace } from "@/lib/files/replace-rules";
import { fileUrl, type FileDto } from "@/lib/files/types";

import { FileUploader } from "./file-uploader";
import { sendToServer, useFileUploads, type SendFile } from "./use-file-uploads";
import { useReplaceFile, type ReplaceFileApi, type Replacing } from "./use-replace-file";

/** Where the section uploads, attaches, and replaces files: the server actions, or the /dev/workspace fixture's stand-in. */
export interface AttachFilesApi {
  send: SendFile;
  attach: (artifactId: string, fileIds: string[]) => Promise<ActionResult<ArtifactDto>>;
  replace: ReplaceFileApi["replace"];
  discard: ReplaceFileApi["discard"];
}

const serverApi: AttachFilesApi = {
  send: sendToServer,
  attach: attachFilesAction,
  replace: replaceFileAction,
  discard: discardUploadAction,
};

/** The line under a file's name: its type and size, or how far its replacement got. */
function rowFacts(file: FileDto, replacing: Replacing | null): string {
  if (!replacing) return `${fileTypeLabel(file.contentType)} · ${formatBytes(file.size)}`;
  return replacing.checking ? "Checking the new file…" : `Uploading the new file · ${String(replacing.progress)}%`;
}

interface RowProps {
  file: FileDto;
  showId: boolean;
  removing: boolean;
  replacing: Replacing | null;
  busy: boolean;
  onRemove: () => void;
  /** Null when the file is not replaced here: media the document embeds, or the icon or cover. */
  onReplace: (() => void) | null;
}

/** One attached file: name, type and size, and open, copy-id, replace, and remove actions. */
function AttachedRow({ file, showId, removing, replacing, busy, onRemove, onReplace }: RowProps) {
  return (
    <li className="card-nested flex min-w-0 items-center gap-3 bg-card px-3 py-2" data-replacing={replacing ? "" : undefined}>
      <IconFile aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{file.filename}</span>
        <span className="text-xs text-muted-foreground" aria-live="polite">{rowFacts(file, replacing)}</span>
      </span>
      {showId ? <CopyButton value={file.id} label="Copy id" variant="ghost" size="xs" /> : null}
      <Button variant="ghost" size="icon-xs" nativeButton={false} render={<a href={fileUrl(file.id, { replacedAt: file.replacedAt })} target="_blank" rel="noopener noreferrer" aria-label={`Open ${file.filename}`} />}>
        <IconExternalLink />
      </Button>
      {onReplace ? (
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Replace ${file.filename}`} title="Replace with a new file" disabled={busy} onClick={onReplace}>
          {replacing ? <IconLoader2 className="animate-spin" /> : <IconReplace />}
        </Button>
      ) : null}
      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${file.filename}`} disabled={removing || busy} onClick={onRemove}>
        {removing ? <IconLoader2 className="animate-spin" /> : <IconTrash />}
      </Button>
    </li>
  );
}

/**
 * The editor's files section: the artifact's attached files, and an uploader
 * that attaches each file as soon as it finishes. Replace puts a new upload
 * in place of a file, keeping its name, place, and links; the old copy
 * stays in History. In a ui artifact, copy a file's id into an Image or File element.
 */
export function AttachedFiles({ artifact, onUpdated, api = serverApi }: { artifact: ArtifactDto; onUpdated: (artifact: ArtifactDto) => void; api?: AttachFilesApi | undefined }) {
  const [removing, setRemoving] = useState<string | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<FileDto | null>(null);
  const { replacing, replace } = useReplaceFile({ artifactId: artifact.id, api, onUpdated });
  const uploads = useFileUploads({
    send: api.send,
    onReady: (file, key) => {
      void api.attach(artifact.id, [file.id])
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

  function pickReplacement(file: FileDto) {
    targetRef.current = file;
    pickerRef.current?.click();
  }

  function onPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    const target = targetRef.current;
    event.target.value = "";
    if (picked && target) void replace(target, picked);
  }

  return (
    <section aria-label="Files" data-slot="attached-files" className="flex flex-col gap-3 border-t bg-background/60 px-5 py-4 sm:px-7">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-md font-medium">Files</h2>
        <span className="text-xs text-muted-foreground">{artifact.files.length === 0 ? "None yet" : `${String(artifact.files.length)} attached`}</span>
      </div>
      {artifact.files.length > 0 ? (
        <ul className="flex min-w-0 flex-col gap-2">
          {artifact.files.map((file) => (
            <AttachedRow
              key={file.id}
              file={file}
              showId={artifact.kind === "ui"}
              removing={removing === file.id}
              replacing={replacing?.fileId === file.id ? replacing : null}
              busy={replacing !== null}
              onRemove={() => void remove(file)}
              onReplace={offersReplace(file, artifact) ? () => { pickReplacement(file); } : null}
            />
          ))}
        </ul>
      ) : null}
      <input ref={pickerRef} type="file" accept={fileInputAccept} className="sr-only" tabIndex={-1} aria-hidden data-slot="replace-file-input" onChange={onPicked} />
      <FileUploader items={uploads.items} onFiles={uploads.addFiles} onRemove={(key) => { uploads.remove(key); }} />
    </section>
  );
}
