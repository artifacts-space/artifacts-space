"use client";

import { IconFile, IconFileTypePdf, IconLoader2, IconMovie, IconMusic, IconPhoto, IconUpload, IconX, type Icon } from "@tabler/icons-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { fileInputAccept } from "@/lib/files/config";
import { isFileMediaUrl, type MediaKind } from "@/lib/files/media-rules";
import { IMAGE_SOURCE_ACCEPT } from "@/lib/images/prepare-rules";

import { useEditorMedia } from "./media-context";
import { fetchableUrl } from "./media-upload-rules";
import { fetchFromLink, retryUpload, startUpload, subscribeUpload, uploadFile, uploadPreviewUrl, uploadState, type UploadedMedia } from "./media-uploads";

/**
 * The two states of a media block before it has a file: the picker (upload
 * a file or paste a link) that the slash menu inserts, and the upload in
 * progress, with a preview for images, progress, and Retry when it fails.
 */

interface KindCopy {
  icon: Icon;
  title: string;
  accept: string;
}

export const kindCopy: Record<MediaKind, KindCopy> = {
  image: { icon: IconPhoto, title: "Add an image", accept: IMAGE_SOURCE_ACCEPT },
  video: { icon: IconMovie, title: "Add a video", accept: "video/mp4,video/webm,.mp4,.webm" },
  audio: { icon: IconMusic, title: "Add audio", accept: "audio/mpeg,audio/wav,.mp3,.wav" },
  pdf: { icon: IconFileTypePdf, title: "Add a PDF", accept: "application/pdf,.pdf" },
  file: { icon: IconFile, title: "Add a file", accept: fileInputAccept },
};

/** The quiet frame every not-yet-filled media block sits in. */
function PickerFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex w-full flex-col gap-3 rounded-lg border border-dashed bg-muted/50 p-3 text-sm sm:p-4">
      {children}
    </div>
  );
}

interface PickerProps {
  kind: MediaKind;
  onFile: (file: File) => void;
  onSource: (src: string) => void;
  onRemove: () => void;
}

/** The site-relative path of a link to one of this site's uploads, or null. */
function ownFilePath(link: string): string | null {
  if (isFileMediaUrl(link)) return link;
  try {
    const url = new URL(link);
    const path = `${url.pathname}${url.hash}`;
    return url.origin === window.location.origin && isFileMediaUrl(path) ? path : null;
  } catch {
    return null;
  }
}

function LinkForm({ onFile, onSource }: Pick<PickerProps, "onFile" | "onSource">) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  async function submit() {
    const own = ownFilePath(link.trim());
    if (own) { onSource(own); return; }
    const url = fetchableUrl(link);
    if (!url) { setError("Paste a link that starts with https://."); return; }
    setBusy(true);
    setError(null);
    try {
      onFile(await fetchFromLink(url));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That link could not be fetched.");
    } finally {
      setBusy(false);
    }
  }

  return (
    // Not a form: the editor may sit inside one, and forms cannot nest.
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <Input value={link} onChange={(event) => { setLink(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void submit(); } }} placeholder="Or paste a link to copy it here" aria-label="Link to a file" aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} className="min-w-0 flex-1" />
        <Button type="button" variant="outline" disabled={busy || !link.trim()} onClick={() => { void submit(); }}>
          {busy ? <IconLoader2 aria-hidden className="animate-spin" /> : null}
          {busy ? "Copying…" : "Add"}
        </Button>
      </div>
      {error ? <p id={errorId} className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

/** The empty block: upload a file of this kind, or copy one in from a link. */
export function MediaPicker({ kind, onFile, onSource, onRemove }: PickerProps) {
  const copy = kindCopy[kind];
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <PickerFrame label={copy.title}>
      <div className="flex items-center gap-2">
        <copy.icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 font-medium">{copy.title}</span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove this block" onClick={onRemove}><IconX aria-hidden /></Button>
      </div>
      <div>
        <input ref={inputRef} type="file" accept={copy.accept} hidden aria-label={`${copy.title}: choose a file`} onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); }} />
        <Button type="button" onClick={() => { inputRef.current?.click(); }}><IconUpload aria-hidden /> Upload a file</Button>
      </div>
      <LinkForm onFile={onFile} onSource={onSource} />
    </PickerFrame>
  );
}

function statusText(status: ReturnType<typeof uploadState>): string {
  if (status.status === "preparing") return "Preparing…";
  if (status.status === "uploading") return `Uploading… ${String(status.progress)}%`;
  if (status.status === "done") return "Uploaded";
  return "Waiting to upload…";
}

interface UploadingProps {
  uploadId: string;
  kind: MediaKind;
  onDone: (file: UploadedMedia) => void;
  onRemove: () => void;
}

/** A block whose file is uploading: progress, then the file; or the reason it failed, with Retry. */
export function UploadingMedia({ uploadId, kind, onDone, onRemove }: UploadingProps) {
  const media = useEditorMedia();
  const state = useSyncExternalStore((listener) => subscribeUpload(uploadId, listener), () => uploadState(uploadId), () => uploadState(uploadId));
  const preview = kind === "image" ? uploadPreviewUrl(uploadId) : null;
  const name = uploadFile(uploadId)?.name ?? "File";

  useEffect(() => { startUpload(uploadId, media.upload); }, [uploadId, media.upload]);
  useEffect(() => { if (state.status === "done") onDone(state.file); }, [state, onDone]);

  if (state.status === "failed") {
    return (
      <PickerFrame label="Upload failed">
        <p role="alert" className="text-destructive">{name}: {state.message}</p>
        <div className="flex gap-2">
          {uploadFile(uploadId) ? <Button type="button" variant="outline" onClick={() => { retryUpload(uploadId, media.upload); }}>Try again</Button> : null}
          <Button type="button" variant="ghost" onClick={onRemove}>Remove</Button>
        </div>
      </PickerFrame>
    );
  }
  const progress = state.status === "uploading" ? state.progress : null;
  return (
    <PickerFrame label={`Uploading ${name}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the picked file, never a remote URL */}
      {preview ? <img src={preview} alt="" className="max-h-80 max-w-full self-start rounded-lg object-contain opacity-60" /> : null}
      <div role="status" className="flex items-center gap-2 text-muted-foreground">
        <IconLoader2 aria-hidden className="size-4 shrink-0 animate-spin" />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className="shrink-0 tabular-nums">{statusText(state)}</span>
      </div>
      {progress === null ? null : <Progress value={progress} aria-label={`Uploading ${name}`} />}
    </PickerFrame>
  );
}
