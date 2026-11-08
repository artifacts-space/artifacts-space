"use client";

import { IconLoader2, IconPhotoUp } from "@tabler/icons-react";
import { useId, useRef, useState } from "react";

import { finalizeUploadAction, requestUploadAction } from "@/app/(workspace)/app/file-actions";
import { putFile } from "@/components/files/put-file";
import { prepareImage } from "@/components/images/prepare-image";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FILE_PREFIX } from "@/lib/artifact-icons";
import { isIconUploadAllowed } from "@/lib/files/icon-rules";
import { iconPrepareProfile, IMAGE_SOURCE_ACCEPT, imageSourceProblem } from "@/lib/images/prepare-rules";

const RULE = "Any photo or image works. It is resized, and its location data removed. Square images look best.";

type UploadState = { phase: "idle" } | { phase: "preparing" } | { phase: "uploading"; progress: number } | { phase: "checking" } | { phase: "error"; message: string };

/**
 * Prepares the picked image as an icon in the browser (upright, at most
 * 512 px, re-encoded without camera data; see prepare-image.ts). A GIF that
 * already fits uploads as is, so an animated icon keeps moving; GIFs carry
 * no camera data. The server checks the result like any upload.
 */
async function preparedIcon(file: File): Promise<File> {
  const problem = imageSourceProblem(file, iconPrepareProfile);
  if (problem) throw new Error(problem);
  if (file.type === "image/gif" && isIconUploadAllowed(file)) return file;
  const prepared = await prepareImage(file, iconPrepareProfile);
  if (!isIconUploadAllowed(prepared)) throw new Error("That image could not be made small enough. Try another one.");
  return prepared;
}

function busyLabel(state: UploadState): string {
  if (state.phase === "preparing") return "Preparing…";
  if (state.phase === "uploading" || state.phase === "checking") return "Uploading…";
  return "Choose an image";
}

/** Uploads one image through the normal file pipeline and returns its id, or throws with a message for people. Shared with cover uploads. */
export async function uploadImageFile(file: File, onProgress: (percent: number) => void): Promise<string> {
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
 * The Upload tab: one image of your own as the icon, phone photos included
 * (prepared in the browser first). It uploads like any
 * file (it counts toward your storage), and the save attaches it to this
 * artifact. Readers see it exactly when they can read the artifact.
 */
export function UploadTab({ onSelect }: UploadTabProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const busy = state.phase === "uploading" || state.phase === "checking" || state.phase === "preparing";

  async function pick(file: File | undefined) {
    if (!file) return;
    setState({ phase: "preparing" });
    try {
      const prepared = await preparedIcon(file);
      setState({ phase: "uploading", progress: 0 });
      const fileId = await uploadImageFile(prepared, (progress) => {
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
        accept={IMAGE_SOURCE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-describedby={hintId}
        onChange={(event) => { void pick(event.target.files?.[0]); event.target.value = ""; }}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy} aria-describedby={hintId} onClick={() => { inputRef.current?.click(); }}>
        {busy ? <IconLoader2 className="animate-spin" /> : null} {busyLabel(state)}
      </Button>
      {state.phase === "uploading" ? <Progress value={state.progress} aria-label="Uploading the icon" className="w-40" /> : null}
      {state.phase === "error" ? <p role="alert" className="text-xs text-tone-danger">{state.message}</p> : null}
    </div>
  );
}
