"use client";

import { IconAlertTriangle } from "@tabler/icons-react";

import { HarnessByline } from "@/components/harness/harness-byline";
import { editorName, LastEdited } from "@/components/history/last-edited";
import { Button } from "@/components/ui/button";
import type { ArtifactEditorDto, ArtifactHarnessDto } from "@/lib/artifact-types";
import { cn } from "@/lib/utils";

import type { AutosaveStatus } from "./use-autosave";

/** The quiet words for a save status: "Saving…", "Saved", or why it is not saved. Null when there is nothing to say. */
export function saveStatusLabel(status: AutosaveStatus, dirty: boolean): string | null {
  if (status.kind === "held" || status.kind === "failed") return status.message;
  if (status.kind === "conflict") return "Not saved";
  if (status.kind === "saving" || dirty) return "Saving…";
  if (status.kind === "saved") return status.waitingForApproval ? "Saved · Readers outside the team see it once it is approved" : "Saved";
  return null;
}

interface SaveStatusBarProps {
  status: AutosaveStatus;
  dirty: boolean;
  length: number;
  updatedAt: string;
  updatedBy: ArtifactEditorDto | null;
  /** The agent harness the artifact was made with, shown after who saved it last. */
  harness?: ArtifactHarnessDto | null | undefined;
  /** False for a new artifact that is not stored yet: nobody has edited it. */
  stored?: boolean;
  onRetry: () => void;
  /** Extra classes from the surrounding layout, such as sticking in the /app shell. */
  className?: string;
}

/** Character count, save status, and who saved last, in the row above the content. */
export function SaveStatusBar({ status, dirty, length, updatedAt, updatedBy, harness, stored = true, onRetry, className }: SaveStatusBarProps) {
  const label = saveStatusLabel(status, dirty);
  const problem = status.kind === "held" || status.kind === "failed";
  return (
    <div data-slot="save-status" className={cn("flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-background/60 px-5 py-2 sm:px-7", className)}>
      <span className="text-xs text-muted-foreground">{length.toLocaleString()} characters</span>
      <span role="status" aria-live="polite" className={cn("inline-flex items-center gap-1.5 text-xs", problem ? "text-foreground" : "text-muted-foreground")}>
        {problem ? <IconAlertTriangle aria-hidden className="size-3.5 shrink-0 text-tone-warning" /> : null}
        {label}
      </span>
      {status.kind === "failed" ? <Button variant="ghost" size="xs" onClick={onRetry}>Try again</Button> : null}
      {stored ? (
        <span className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1">
          <LastEdited editor={updatedBy} at={updatedAt} />
          <HarnessByline harness={harness} className="text-xs" />
        </span>
      ) : <span className="ml-auto text-xs text-muted-foreground">Saves once you write something</span>}
    </div>
  );
}

interface ConflictNoticeProps {
  status: AutosaveStatus;
  onLoadTheirs: () => void;
  onKeepMine: () => void;
  /** Extra classes from the surrounding layout, such as a framed notice on the artifact page. */
  className?: string;
}

/**
 * Shown when someone else (a person or an agent) saved while this editor had
 * changes that touch the same part. Nothing was overwritten: the editor can
 * load the newer version, or save its own changes over it. Either way, the
 * other version stays in the history. Nothing shows without a conflict.
 */
export function ConflictNotice({ status, onLoadTheirs, onKeepMine, className }: ConflictNoticeProps) {
  if (status.kind !== "conflict") return null;
  const editor = status.theirs.updatedBy;
  const who = editor ? editorName(editor) : "Someone";
  return (
    <div role="status" className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-muted/50 px-5 py-2.5 sm:px-7", className)}>
      <IconAlertTriangle aria-hidden className="size-4 shrink-0 text-tone-warning" />
      <p className="min-w-0 flex-1 text-sm">
        {who} saved a newer version while you were editing. Your latest changes are not saved yet.
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="outline" size="sm" onClick={onLoadTheirs}>Load their version</Button>
        <Button variant="ghost" size="sm" onClick={onKeepMine}>Keep my changes</Button>
      </div>
    </div>
  );
}
