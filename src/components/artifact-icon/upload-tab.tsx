"use client";

import { IconLoader2, IconPhotoUp } from "@tabler/icons-react";
import { useId, useRef, useState } from "react";

import { finalizeUploadAction, requestUploadAction } from "@/app/(workspace)/app/file-actions";
import { putFile } from "@/components/files/put-file";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FILE_PREFIX } from "@/lib/artifact-icons";
import { isIconUploadAllowed } from "@/lib/files/icon-rules";

const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/avif";
const RULE = "PNG, JPEG, GIF, WebP, or AVIF, up to 1 MB. Square images look best.";

type UploadState = { phase: "idle" } | { phase: "uploading"; progress: number } | { phase: "checking" } | { phase: "error"; message: string };

/** Uploads one image through the normal file pipeline and returns its id, or throws with a message for people. */
async function uploadIcon(file: File, onProgress: (percent: number) => void): Promise<string> {
  const ticket = await requestUploadAction({ filename: file.name, contentType: file.type, size: file.size });
  if (!ticket.success) throw new Error(ticket.error);
  await putFile(ticket.data.url, ticket.data.headers, file, onProgress);
  const ready = await finalizeUploadAction(ticket.data.fileId);
  if (!ready.success) throw new Error(ready.error);
  return ready.data.id;
}

interface UploadTabProps {
  onSelect: (icon: string) => void;
}

/**
 * The Upload tab: one image of your own as the icon. It uploads like any
 * file (it counts toward your storage), and the save attaches it to this
 * artifact. Readers see it exactly when they can read the artifact.
 */
export function UploadTab({ onSelect }: UploadTabProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const busy = state.phase === "uploading" || state.phase === "checking";

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!isIconUploadAllowed(file)) {
      setState({ phase: "error", message: `That file cannot be an icon. Use a ${RULE.charAt(0).toLowerCase()}${RULE.slice(1)}` });
      return;
    }
    setState({ phase: "uploading", progress: 0 });
    try {
      const fileId = await uploadIcon(file, (progress) => {
        setState(progress >= 100 ? { phase: "checking" } : { phase: "uploading", progress });
      });
      setState({ phase: "idle" });
      onSelect(`${FILE_PREFIX}${fileId}`);
    } catch (error) {
      setState({ phase: "error", message: error instanceof Error ? error.message : "The upload failed. Try again." });
    }
  }

  return (
    <div className="flex h-80 flex-col items-center justify-center gap-3 px-6 text-center">
      <IconPhotoUp aria-hidden className="size-8 text-muted-foreground" stroke={1.5} />
      <p id={hintId} className="text-sm text-muted-foreground">{RULE}</p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-describedby={hintId}
        onChange={(event) => { void pick(event.target.files?.[0]); event.target.value = ""; }}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy} aria-describedby={hintId} onClick={() => { inputRef.current?.click(); }}>
        {busy ? <IconLoader2 className="animate-spin" /> : null} {busy ? "Uploading…" : "Choose an image"}
      </Button>
      {state.phase === "uploading" ? <Progress value={state.progress} aria-label="Uploading the icon" className="w-40" /> : null}
      {state.phase === "error" ? <p role="alert" className="text-xs text-tone-danger">{state.message}</p> : null}
    </div>
  );
}
