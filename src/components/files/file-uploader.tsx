"use client";

import { IconAlertTriangle, IconCircleCheck, IconLoader2, IconUpload, IconX } from "@tabler/icons-react";
import { useId, useRef, useState, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { allowedTypesHint, fileInputAccept, fileLimits, formatBytes } from "@/lib/files/config";
import { cn } from "@/lib/utils";

import type { UploadItem } from "./use-file-uploads";

function statusText(item: UploadItem) {
  if (item.status === "error") return item.error ?? "The upload failed.";
  if (item.status === "checking") return "Checking…";
  if (item.status === "ready") return `${formatBytes(item.size)} · Ready`;
  return `${formatBytes(item.size)} · ${String(item.progress)}%`;
}

function StatusIcon({ status }: { status: UploadItem["status"] }) {
  if (status === "error") return <IconAlertTriangle aria-hidden className="size-4 shrink-0 text-tone-danger" />;
  if (status === "ready") return <IconCircleCheck aria-hidden className="size-4 shrink-0 text-tone-success" />;
  return <IconLoader2 aria-hidden className="size-4 shrink-0 animate-spin text-muted-foreground" />;
}

/** One picked file: name, progress or error, and a remove button. */
function UploadRow({ item, onRemove }: { item: UploadItem; onRemove: (key: string) => void }) {
  return (
    <li className="flex min-w-0 flex-col gap-1.5 rounded-md border bg-card px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <StatusIcon status={item.status} />
        <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${item.name}`} onClick={() => { onRemove(item.key); }}>
          <IconX />
        </Button>
      </div>
      {item.status === "uploading" ? <Progress value={item.progress} aria-label={`Uploading ${item.name}`} /> : null}
      <p role={item.status === "error" ? "alert" : undefined} className={cn("text-xs break-words", item.status === "error" ? "text-tone-danger" : "text-muted-foreground")}>
        {statusText(item)}
      </p>
    </li>
  );
}

interface FileUploaderProps {
  items: readonly UploadItem[];
  onFiles: (files: File[]) => void;
  onRemove: (key: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Drag and drop or pick files, with per-file progress and errors. The upload
 * work lives in useFileUploads; this only shows it.
 */
export function FileUploader({ items, onFiles, onRemove, disabled = false, className }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [dragging, setDragging] = useState(false);

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) onFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => { setDragging(false); }}
        onDrop={drop}
        className={cn(
          "flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-6 text-center transition-colors",
          dragging ? "border-primary bg-muted/60" : "bg-muted/30",
        )}
      >
        <IconUpload aria-hidden className="size-5 text-muted-foreground" />
        <p className="text-sm">Drop files here, or</p>
        <Button type="button" variant="outline" size="sm" disabled={disabled} aria-describedby={hintId} onClick={() => inputRef.current?.click()}>
          Choose files
        </Button>
        <p id={hintId} className="max-w-md text-sm leading-5 text-muted-foreground">
          Up to {formatBytes(fileLimits.maxBytes)} each, {String(fileLimits.maxFilesPerArtifact)} per artifact. {allowedTypesHint}.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={fileInputAccept}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            onFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </div>
      {items.length > 0 ? (
        <ul className="flex min-w-0 flex-col gap-2" aria-label="Uploads">
          {items.map((item) => <UploadRow key={item.key} item={item} onRemove={onRemove} />)}
        </ul>
      ) : null}
    </div>
  );
}
