"use client";

import { IconExternalLink, IconFile, IconLoader2, IconPaperclip, IconReplace, IconRowInsertBottom, IconTrash } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { attachFilesAction, deleteFileAction, discardUploadAction, replaceFileAction } from "@/app/(workspace)/app/file-actions";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import type { ActionResult, ArtifactDto } from "@/lib/artifact-types";
import { fileInputAccept, formatBytes, fileTypeLabel } from "@/lib/files/config";
import { ATTACH_FILE_LABEL, looseFilesWords } from "@/lib/files/loose-rules";
import { offersReplace } from "@/lib/files/replace-rules";
import { fileUrl, type FileDto } from "@/lib/files/types";
import { cn } from "@/lib/utils";

import { attachFilesEvent, readAttachRequest } from "./attach-bridge";
import type { DroppedFile } from "./dropped-files";
import { FileUploader, UploadList } from "./file-uploader";
import type { PageFilesApi } from "./page-files-api";
import { sendToServer, useFileUploads, type SendFile } from "./use-file-uploads";
import { useReplaceFile, type ReplaceFileApi, type Replacing } from "./use-replace-file";

/** Where the section uploads, attaches, and replaces files: the server actions, or the /dev/workspace fixture's stand-in. */
export interface AttachFilesApi {
  send: SendFile;
  attach: (artifactId: string, fileIds: string[]) => Promise<ActionResult<ArtifactDto>>;
  replace: ReplaceFileApi["replace"];
  discard: ReplaceFileApi["discard"];
  /** Where a web page's page files go; the server actions when left out. */
  page?: PageFilesApi | undefined;
}

/** The server actions behind the list. */
export const serverApi: AttachFilesApi = {
  send: sendToServer,
  attach: attachFilesAction,
  replace: replaceFileAction,
  discard: discardUploadAction,
};

/** The line under a file's name: its type and size (and what it is, where a list holds two kinds), or how far its replacement got. */
function rowFacts(file: FileDto, replacing: Replacing | null, kindLabel: string | undefined): string {
  if (!replacing) return `${kindLabel ?? (file.pagePath === undefined ? "" : "Page file")}${kindLabel === undefined && file.pagePath === undefined ? "" : " · "}${fileTypeLabel(file.contentType)} · ${formatBytes(file.size)}`;
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
  /** Puts the file into the document's text; set only in a document's quiet list. */
  onAdd?: (() => void) | undefined;
  /** What the file is, first on the line under its name, in a list that holds page files and attachments ("Attachment"). */
  kindLabel?: string | undefined;
}

/** One attached file: name, type and size, and open, copy-id, add-to-document, replace, and remove actions. */
export function AttachedRow({ file, showId, removing, replacing, busy, onRemove, onReplace, onAdd, kindLabel }: RowProps) {
  return (
    <li className="card-nested flex min-w-0 items-center gap-3 bg-card px-3 py-2" data-replacing={replacing ? "" : undefined}>
      <IconFile aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col">
        {/* A page file shows the path its page loads it by. */}
        <span className="truncate text-sm">{file.pagePath ?? file.filename}</span>
        <span className="text-xs text-muted-foreground" aria-live="polite">{rowFacts(file, replacing, kindLabel)}</span>
      </span>
      {showId ? <CopyButton value={file.id} label="Copy id" variant="ghost" size="xs" /> : null}
      {onAdd ? (
        <Button type="button" variant="ghost" size="xs" aria-label={`Add to document: ${file.filename}`} disabled={busy} onClick={onAdd}>
          <IconRowInsertBottom aria-hidden /> Add to document
        </Button>
      ) : null}
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

/** The quiet list: only these files, under "Attached files", with no upload box. */
export interface QuietFiles {
  /** The files the page shows nowhere else (looseFiles). */
  files: readonly FileDto[];
  /** Puts files into the document's text, in the order given. Left out where there is no document to put them in. */
  onAddToDocument?: ((files: readonly FileDto[]) => void) | undefined;
  /**
   * True for a format that keeps attachments beside its content
   * (attachesBeside): the list offers "Attach file", and takes the page's
   * requests to attach (attach-bridge.ts): "Attach file" in the More menu,
   * and files dropped anywhere on the page.
   */
  attach?: boolean | undefined;
  /** True while files are held over the page, so the list says what a drop will do. */
  dragging?: boolean | undefined;
}

/**
 * The editor's files section: the artifact's attached files, and an uploader
 * that attaches each file as soon as it finishes. Replace puts a new upload
 * in place of a file, keeping its name, place, and links; the old copy
 * stays in History. In a ui artifact, copy a file's id into an Image or File element.
 *
 * With `quiet` it is the list a document and the other text formats show
 * instead (filesPanel): the files that are attached and shown nowhere on
 * the page, each with Open, Replace, and Remove. In a document each has
 * "Add to document", and the heading "Add all to document": its files go
 * into its text, so the list is there to be emptied, and it has no way to
 * add one. In the other formats the heading has "Attach file", and the
 * list takes what the page sends it (attach-bridge.ts). It has no upload
 * box, and it draws nothing while it has no file, no upload on its way,
 * and no file held over the page.
 */
interface AttachedFilesProps {
  artifact: ArtifactDto;
  onUpdated: (artifact: ArtifactDto) => void;
  api?: AttachFilesApi | undefined;
  /** The content's column in the /app pane (previewColumnClass): the section is a band across the pane, and its rows keep to the column, under the body they belong to. */
  column?: string | undefined;
  /** Extra classes for the band, such as the room the pane leaves beside the column. */
  className?: string | undefined;
  quiet?: QuietFiles | undefined;
}

/** The words beside the heading: how many files, and in the quiet list why they are listed. */
function countWords(files: readonly FileDto[], quiet: boolean): string {
  if (quiet) return looseFilesWords(files);
  return files.length === 0 ? "None yet" : `${String(files.length)} attached`;
}

/** The heading's controls in the quiet list: "Add all to document" in a document with more than one file, "Attach file" in the other formats. */
function QuietActions({ quiet, busy, onAttach }: { quiet: QuietFiles; busy: boolean; onAttach: () => void }) {
  const { files, onAddToDocument, attach } = quiet;
  return (
    <>
      {onAddToDocument && files.length > 1 ? (
        <Button type="button" variant="ghost" size="xs" disabled={busy} onClick={() => { onAddToDocument(files); }}>
          <IconRowInsertBottom aria-hidden /> Add all to document
        </Button>
      ) : null}
      {attach ? (
        <Button type="button" variant="ghost" size="xs" onClick={onAttach}>
          <IconPaperclip aria-hidden /> {ATTACH_FILE_LABEL}
        </Button>
      ) : null}
    </>
  );
}

/**
 * Answers the page's requests to attach files to this artifact
 * (attach-bridge.ts) while `enabled`: with files, they upload and attach;
 * with none, the file picker opens.
 */
export function useAttachRequests(artifactId: string, enabled: boolean, onFiles: (files: DroppedFile[]) => void, onPick: () => void) {
  const handlers = useRef({ onFiles, onPick });
  useEffect(() => { handlers.current = { onFiles, onPick }; }, [onFiles, onPick]);
  useEffect(() => {
    if (!enabled) return;
    const take = (event: Event) => {
      const request = readAttachRequest(event, artifactId);
      if (!request) return;
      event.preventDefault();
      if (request.files) handlers.current.onFiles(request.files);
      else handlers.current.onPick();
    };
    document.addEventListener(attachFilesEvent, take);
    return () => { document.removeEventListener(attachFilesEvent, take); };
  }, [artifactId, enabled]);
}

/** The section's uploads: each file is attached to the artifact as soon as it is ready, and one that is refused says why in its row. */
export function useAttachingUploads(artifactId: string, api: AttachFilesApi, onUpdated: (artifact: ArtifactDto) => void) {
  const uploads = useFileUploads({
    send: api.send,
    onReady: (file, key) => {
      void api.attach(artifactId, [file.id])
        .then((result) => {
          // Refused: the row says why, by the file's name, and its Remove deletes the upload.
          if (!result.success) { uploads.fail(key, result.error); return; }
          onUpdated(result.data);
          uploads.remove(key, { deleteUpload: false });
        })
        .catch(() => { uploads.fail(key, "The file could not be added. Remove it and try again."); });
    },
  });
  return uploads;
}

/** Removes an attached file, and says which one is on its way out. */
export function useRemoveFile(onUpdated: (artifact: ArtifactDto) => void) {
  const [removing, setRemoving] = useState<string | null>(null);
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
  return { removing, remove };
}

interface PickersProps {
  /** Takes the file picked to replace the row that asked. */
  onReplacement: (file: File) => void;
  /** Takes the files picked to attach; left out where the list does not attach. */
  onAttach: ((files: File[]) => void) | undefined;
  replaceRef: React.RefObject<HTMLInputElement | null>;
  attachRef: React.RefObject<HTMLInputElement | null>;
}

/** The hidden file pickers: one for Replace, and one for "Attach file" where the list attaches. */
function Pickers({ onReplacement, onAttach, replaceRef, attachRef }: PickersProps) {
  return (
    <>
      <input
        ref={replaceRef}
        type="file"
        accept={fileInputAccept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-slot="replace-file-input"
        onChange={(event) => {
          const [picked] = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (picked) onReplacement(picked);
        }}
      />
      {onAttach ? (
        <input
          ref={attachRef}
          type="file"
          multiple
          accept={fileInputAccept}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          data-slot="attach-file-input"
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (picked.length > 0) onAttach(picked);
          }}
        />
      ) : null}
    </>
  );
}

interface FilesFrameProps {
  quiet: QuietFiles | undefined;
  /** The heading, when it is not the format's usual one. */
  heading?: string | undefined;
  /** What the list says while files are held over the page (dropHint). */
  hint?: string | undefined;
  column: string | undefined;
  className: string | undefined;
  /** How many files the list holds, in words. */
  count: string;
  /** The buttons beside the heading. */
  actions: React.ReactNode;
  children: React.ReactNode;
}

/** The section around the rows: its heading, the buttons beside it, the count, and, while files are held over the page, where they will go. */
export function FilesFrame({ quiet, heading: named, hint = "Drop to attach it to this artifact", column, className, count, actions, children }: FilesFrameProps) {
  const heading = named ?? (quiet ? "Attached files" : "Files");
  return (
    <section aria-label={heading} data-slot="attached-files" data-quiet={quiet ? "" : undefined} className={cn("border-t bg-background/60 py-4", column ? null : "px-5 sm:px-7", className)}>
      <div className={cn(column, "flex flex-col gap-3")}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-md font-medium">{heading}</h2>
          {actions}
          <span className="ml-auto text-xs text-muted-foreground">{count}</span>
        </div>
        {quiet?.dragging ? <p data-slot="attach-drop-hint" className="card-nested border-dashed px-4 py-6 text-center text-md text-muted-foreground">{hint}</p> : null}
        {children}
      </div>
    </section>
  );
}

/** True when the quiet list has nothing to draw: no file, no upload on its way, and no file held over the page. */
function drawsNothing(quiet: QuietFiles | undefined, uploading: number): boolean {
  if (!quiet) return false;
  return quiet.files.length === 0 && uploading === 0 && quiet.dragging !== true;
}

export function AttachedFiles({ artifact, onUpdated, api = serverApi, column, className, quiet }: AttachedFilesProps) {
  const files = quiet ? quiet.files : artifact.files;
  const replaceRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<FileDto | null>(null);
  const { replacing, replace } = useReplaceFile({ artifactId: artifact.id, api, onUpdated });
  const uploads = useAttachingUploads(artifact.id, api, onUpdated);
  const { removing, remove } = useRemoveFile(onUpdated);
  const attaches = quiet?.attach === true;
  const pickToAttach = () => { attachRef.current?.click(); };
  useAttachRequests(artifact.id, attaches, (dropped) => { uploads.addFiles(dropped.map((entry) => entry.file)); }, pickToAttach);
  const removeUpload = (key: string) => { uploads.remove(key); };

  const pickers = (
    <Pickers
      replaceRef={replaceRef}
      attachRef={attachRef}
      onReplacement={(picked) => { if (targetRef.current) void replace(targetRef.current, picked); }}
      onAttach={attaches ? uploads.addFiles : undefined}
    />
  );
  // Only the pickers the page's requests open.
  if (drawsNothing(quiet, uploads.items.length)) return pickers;

  return (
    <FilesFrame quiet={quiet} column={column} className={className} count={countWords(files, quiet !== undefined)} actions={quiet ? <QuietActions quiet={quiet} busy={replacing !== null} onAttach={pickToAttach} /> : null}>
      {files.length > 0 ? (
        <ul className="flex min-w-0 flex-col gap-2">
          {files.map((file) => (
            <AttachedRow
              key={file.id}
              file={file}
              showId={artifact.kind === "ui" || artifact.kind === "canvas"}
              removing={removing === file.id}
              replacing={replacing?.fileId === file.id ? replacing : null}
              busy={replacing !== null}
              onRemove={() => void remove(file)}
              onReplace={offersReplace(file, artifact) ? () => { targetRef.current = file; replaceRef.current?.click(); } : null}
              onAdd={quiet?.onAddToDocument ? () => { quiet.onAddToDocument?.([file]); } : undefined}
            />
          ))}
        </ul>
      ) : null}
      {pickers}
      {quiet ? <UploadList items={uploads.items} onRemove={removeUpload} /> : <FileUploader items={uploads.items} onFiles={uploads.addFiles} onRemove={removeUpload} />}
    </FilesFrame>
  );
}
