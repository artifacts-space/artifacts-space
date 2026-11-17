"use client";

import { IconAlertTriangle, IconCheck, IconCopy, IconInfoCircle } from "@tabler/icons-react";

import { COPY_LINK_LABEL } from "@/components/copy-button";
import { HarnessByline } from "@/components/harness/harness-byline";
import { editorName, LastEdited } from "@/components/history/last-edited";
import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/components/use-copy-to-clipboard";
import type { ArtifactEditorDto, ArtifactHarnessDto } from "@/lib/artifact-types";
import { cn } from "@/lib/utils";

import type { AutosaveStatus } from "./use-autosave";
import { gutterRoom } from "./detail-scroll";

/** The quiet words for a save status: "Saving…", "Saved", or why it is not saved. Null when there is nothing to say. */
export function saveStatusLabel(status: AutosaveStatus, dirty: boolean): string | null {
  if (status.kind === "held" || status.kind === "failed") return status.message;
  if (status.kind === "conflict") return "Not saved";
  if (status.kind === "saving" || dirty) return "Saving…";
  if (status.kind === "saved") return status.waitingForApproval ? "Saved · Readers outside the team see it once it is approved" : "Saved";
  return null;
}

/** True when a save did not go through and the person must act: it was held back, or it failed. */
export function isSaveProblem(status: AutosaveStatus): boolean {
  return status.kind === "held" || status.kind === "failed";
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
  /** The artifact's link: the first characters of its id show, with a button that copies the link. Left out for a new artifact. */
  link?: ArtifactLink | undefined;
  onRetry: () => void;
  /** The content's column (previewColumnClass), so the line sits under the title. */
  column?: string;
  /** Extra classes from the surrounding layout, such as the pane's gutter and surface. */
  className?: string;
}

/** A dot between the meta line's parts. */
function Dot() {
  return <span aria-hidden>·</span>;
}

/** What the meta line's copy button gives out: the artifact's id as its link carries it, and the link. */
export interface ArtifactLink {
  /** The 22-character id, the last part of the link. Never the internal id. */
  publicId: string;
  /** The artifact's own address on this site: /artifact/<publicId>. */
  url: string;
}

/** How many characters of the id the meta line shows. */
const SHORT_ID_CHARS = 8;

/**
 * The start of the artifact's id and a button that copies its link, for an
 * agent or a support request. The link is what opens the artifact: every
 * MCP tool reads it, and so does a browser. It never shows or copies the
 * internal id, which opens nothing.
 */
function ShortLink({ link }: { link: ArtifactLink }) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <span data-slot="artifact-link" className="inline-flex items-center gap-0.5">
      <span className="font-mono">{link.publicId.slice(0, SHORT_ID_CHARS)}</span>
      <button
        type="button"
        onClick={() => void copy(link.url)}
        aria-label={copied ? "Copied the link" : COPY_LINK_LABEL}
        title={COPY_LINK_LABEL}
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
 * how long it is, the save status, and the start of the id with a button
 * that copies the artifact's link.
 */
export function SaveStatusBar({ status, dirty, length, updatedAt, updatedBy, harness, stored = true, link, onRetry, column, className }: SaveStatusBarProps) {
  const label = saveStatusLabel(status, dirty);
  const problem = isSaveProblem(status);
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
        {link ? <><Dot /><ShortLink link={link} /></> : null}
      </div>
    </div>
  );
}

interface NoticeBandProps {
  /** The content's column in the /app pane (previewColumnClass). Without it the notice pads itself, as on the artifact page. */
  column?: string | undefined;
  /** Extra classes from the surrounding layout, such as a framed notice on the artifact page. */
  className?: string | undefined;
  slot?: string | undefined;
  children: React.ReactNode;
}

const noticeRow = "flex flex-wrap items-center gap-x-3 gap-y-2";

/**
 * A notice above the body. In the /app pane it is a band across the pane
 * whose words keep to the content's column, so they start where the title
 * starts; elsewhere it is one padded row.
 */
function NoticeBand({ column, className, slot, children }: NoticeBandProps) {
  if (!column) return <div role="status" data-slot={slot} className={cn(noticeRow, "border-b bg-muted/50 px-5 py-2.5 sm:px-7", className)}>{children}</div>;
  return (
    <div role="status" data-slot={slot} className={cn("border-b bg-muted/50 py-2.5", gutterRoom, className)}>
      <div className={cn(column, noticeRow)}>{children}</div>
    </div>
  );
}

interface ConflictNoticeProps {
  status: AutosaveStatus;
  onLoadTheirs: () => void;
  onKeepMine: () => void;
  /** Extra classes from the surrounding layout, such as a framed notice on the artifact page. */
  className?: string;
  /** The content's column in the /app pane, so the notice lines up with the title. */
  column?: string;
}

/**
 * Shown when someone else (a person or an agent) saved while this editor had
 * changes that touch the same part. Nothing was overwritten: the editor can
 * load the newer version, or save its own changes over it. Either way, the
 * other version stays in the history. Nothing shows without a conflict.
 */
export function ConflictNotice({ status, onLoadTheirs, onKeepMine, className, column }: ConflictNoticeProps) {
  if (status.kind !== "conflict") return null;
  const editor = status.theirs.updatedBy;
  const who = editor ? editorName(editor) : "Someone";
  return (
    <NoticeBand column={column} className={className}>
      <IconAlertTriangle aria-hidden className="size-4 shrink-0 text-tone-warning" />
      <p className="min-w-0 flex-1 text-sm">
        {who} saved a newer version while you were editing. Your latest changes are not saved yet.
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="outline" size="sm" onClick={onLoadTheirs}>Load their version</Button>
        <Button variant="ghost" size="sm" onClick={onKeepMine}>Keep my changes</Button>
      </div>
    </NoticeBand>
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
  /** The content's column in the /app pane, so the notice lines up with the title. */
  column?: string;
}

/** The words of the notice, kept in one place for the editor and its tests. */
export const AGENT_SAVE_NOTICE = "An agent saved changes while you were editing. Your version is saved; theirs is in History.";

/**
 * Shown after the person's save went through over an agent's newer save: a
 * person's work wins, and the agent's version stays in History, where the
 * person can compare or restore it. Nothing shows otherwise.
 */
export function AgentSaveNotice({ show, onDismiss, history, className, column }: AgentSaveNoticeProps) {
  if (!show) return null;
  return (
    <NoticeBand column={column} className={className} slot="agent-save-notice">
      <IconInfoCircle aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-sm">{AGENT_SAVE_NOTICE}</p>
      <div className="flex shrink-0 items-center gap-1">
        {history}
        <Button variant="ghost" size="sm" onClick={onDismiss}>Dismiss</Button>
      </div>
    </NoticeBand>
  );
}

interface CatchUpNoticeProps {
  /** Who changed what, after the editor took a newer save; null shows nothing. */
  words: string | null;
  onDismiss: () => void;
  /** Opens History, where the version from before the change is. */
  history?: React.ReactNode;
  className?: string;
  /** The content's column in the /app pane, so the notice lines up with the title. */
  column?: string;
}

/**
 * Shown after an open canvas or interface took a newer save when its tab
 * came back (use-catch-up.tsx): who saved and what changed. Dismissing it
 * also clears the marks on the changed frames.
 */
export function CatchUpNotice({ words, onDismiss, history, className, column }: CatchUpNoticeProps) {
  if (words === null) return null;
  return (
    <NoticeBand column={column} className={className} slot="catch-up-notice">
      <IconInfoCircle aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-sm break-words">{words}</p>
      <div className="flex shrink-0 items-center gap-1">
        {history}
        <Button variant="ghost" size="sm" onClick={onDismiss}>Dismiss</Button>
      </div>
    </NoticeBand>
  );
}

/** The notice's way into History, as VersionHistory's `trigger`. */
export function openHistoryButton(openHistory: () => void) {
  return <Button variant="outline" size="sm" onClick={openHistory}>Open History</Button>;
}
