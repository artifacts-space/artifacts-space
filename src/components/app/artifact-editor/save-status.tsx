"use client";

import { IconAlertTriangle, IconCheck, IconCopy, IconInfoCircle } from "@tabler/icons-react";

import { HarnessByline } from "@/components/harness/harness-byline";
import { editorName, LastEdited } from "@/components/history/last-edited";
import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/components/use-copy-to-clipboard";
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
  /** The artifact's id: its first 8 characters show, with a button that copies all of it. Left out for a new artifact. */
  id?: string | undefined;
  onRetry: () => void;
  /** The content's column (previewColumnClass), so the line sits under the title. */
  column?: string;
  /** Extra classes from the surrounding layout, such as sticking in the /app shell. */
  className?: string;
}

/** A dot between the meta line's parts. */
function Dot() {
  return <span aria-hidden>·</span>;
}

/** The short id and a button that copies the whole id, for an agent or a support request. */
function ShortId({ id }: { id: string }) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="font-mono">{id.slice(0, 8)}</span>
      <button
        type="button"
        onClick={() => void copy(id)}
        aria-label={copied ? "Copied the id" : "Copy the artifact id"}
        title="Copy the artifact id"
        // 44px to tap on touch screens; the negative margin keeps the meta line's height.
        className="inline-flex size-6 items-center justify-center rounded-md hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:-m-2.5 pointer-coarse:size-11"
      >
        {copied ? <IconCheck aria-hidden className="size-3.5" /> : <IconCopy aria-hidden className="size-3.5" />}
      </button>
    </span>
  );
}

/** Who saved it last and through which agent, or that a new artifact saves once something is written. */
function EditedBy({ stored, updatedAt, updatedBy, harness }: Pick<SaveStatusBarProps, "updatedAt" | "updatedBy" | "harness"> & { stored: boolean }) {
  if (!stored) return <span>Saves once you write something</span>;
  return (
    <>
      <LastEdited editor={updatedBy} at={updatedAt} />
      <HarnessByline harness={harness} className="text-xs" />
    </>
  );
}

/**
 * The meta line under the title: who saved it last and through which agent,
 * how long it is, the save status, and the short id with a copy button.
 */
export function SaveStatusBar({ status, dirty, length, updatedAt, updatedBy, harness, stored = true, id, onRetry, column, className }: SaveStatusBarProps) {
  const label = saveStatusLabel(status, dirty);
  const problem = status.kind === "held" || status.kind === "failed";
  return (
    <div data-slot="save-status" className={cn("pt-1", className)}>
      <div className={cn("flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 border-b pb-3 text-xs text-muted-foreground", column ?? "px-5 sm:px-7")}>
        <EditedBy stored={stored} updatedAt={updatedAt} updatedBy={updatedBy} harness={harness} />
        <Dot />
        <span>{length.toLocaleString()} {length === 1 ? "char" : "chars"}</span>
        {label ? <Dot /> : null}
        <span role="status" aria-live="polite" className={cn("inline-flex items-center gap-1.5", problem ? "text-foreground" : undefined)}>
          {problem ? <IconAlertTriangle aria-hidden className="size-3.5 shrink-0 text-tone-warning" /> : null}
          {label}
        </span>
        {status.kind === "failed" ? <Button variant="ghost" size="xs" onClick={onRetry}>Try again</Button> : null}
        {id ? <><Dot /><ShortId id={id} /></> : null}
      </div>
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

interface AgentSaveNoticeProps {
  /** An agent saved while this editor had changes, and this editor's save went through over it. */
  show: boolean;
  onDismiss: () => void;
  /** Opens History, where the agent's version is; the caller draws it with its own History props. */
  history?: React.ReactNode;
  /** Extra classes from the surrounding layout, such as a framed notice on the artifact page. */
  className?: string;
}

/** The words of the notice, kept in one place for the editor and its tests. */
export const AGENT_SAVE_NOTICE = "An agent saved changes while you were editing. Your version is saved; theirs is in History.";

/**
 * Shown after the person's save went through over an agent's newer save: a
 * person's work wins, and the agent's version stays in History, where the
 * person can compare or restore it. Nothing shows otherwise.
 */
export function AgentSaveNotice({ show, onDismiss, history, className }: AgentSaveNoticeProps) {
  if (!show) return null;
  return (
    <div role="status" data-slot="agent-save-notice" className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-muted/50 px-5 py-2.5 sm:px-7", className)}>
      <IconInfoCircle aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-sm">{AGENT_SAVE_NOTICE}</p>
      <div className="flex shrink-0 items-center gap-1">
        {history}
        <Button variant="ghost" size="sm" onClick={onDismiss}>Dismiss</Button>
      </div>
    </div>
  );
}

/** The notice's way into History, as VersionHistory's `trigger`. */
export function openHistoryButton(openHistory: () => void) {
  return <Button variant="outline" size="sm" onClick={openHistory}>Open History</Button>;
}
