"use client";

import { IconAlertTriangle, IconCode, IconDots } from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";

import { ConflictNotice, saveStatusLabel } from "@/components/app/artifact-editor/save-status";
import { useArtifactDraft } from "@/components/app/artifact-editor/use-artifact-draft";
import { useAutosave, type AutosaveStatus, type SaveArtifact } from "@/components/app/artifact-editor/use-autosave";
import { VersionHistory } from "@/components/history/version-history";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ArtifactDto } from "@/lib/artifact-types";
import { cn } from "@/lib/utils";

import { PageEditContext, type PageEdit } from "./page-edit-context";
import { useLeaveGuard } from "./use-leave-guard";

interface SaveLineProps {
  status: AutosaveStatus;
  dirty: boolean;
  onRetry: () => void;
}

/** The quiet "Saving… / Saved" line, or why the latest change is not saved. */
function SaveLine({ status, dirty, onRetry }: SaveLineProps) {
  const label = saveStatusLabel(status, dirty);
  const problem = status.kind === "held" || status.kind === "failed";
  return (
    <span className="mr-auto flex min-w-0 flex-1 items-center gap-2">
      {/* One line, so a long reason never pushes the artifact down while typing; the full text is in the tooltip. */}
      <span role="status" aria-live="polite" title={label ?? undefined} className={cn("flex min-w-0 items-center gap-1.5 text-xs", problem ? "text-foreground" : "text-muted-foreground")}>
        {problem ? <IconAlertTriangle aria-hidden className="size-3.5 shrink-0 text-tone-warning" /> : null}
        <span className="truncate">{label}</span>
      </span>
      {status.kind === "failed" ? <Button variant="ghost" size="xs" onClick={onRetry}>Try again</Button> : null}
    </span>
  );
}

interface PageEditBarProps {
  /** History, with the restore check for the version the editor sees. */
  history: React.ReactNode;
  /** The save line; empty while the editable copy loads. */
  status?: React.ReactNode;
  source: { open: boolean; onToggle: () => void } | null;
}

/**
 * The row above an artifact its viewer may edit: the save status, History,
 * and More (View source). There is no Edit button and no Save button: the
 * artifact is editable where it reads, and changes save on their own.
 */
export function PageEditBar({ history, status, source }: PageEditBarProps) {
  return (
    <div data-slot="editor-bar" className="mb-6 flex min-h-8 items-center justify-end gap-1">
      {status ?? <span className="mr-auto" />}
      {history}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More actions" disabled={!source} />}>
          <IconDots />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={source?.onToggle} className="py-2">
            <IconCode /> {source?.open ? "Hide source" : "View source"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface PageInlineEditorProps {
  /** The latest saved copy, loaded for this editor (never from a cached page). */
  artifact: ArtifactDto;
  /** Link and public artifacts: edits and restores may wait for approval. */
  reviewed: boolean;
  /** Called after every save and restore, so the server-rendered parts of the page catch up. */
  onSaved: (artifact: ArtifactDto) => void;
  /** Sends a save; the dev fixture passes a stand-in. Defaults to the web save action. */
  save?: SaveArtifact;
  /** The page's heading and body, which read the edit state through PageEditContext. */
  children: React.ReactNode;
}

/**
 * Unlocks an artifact on its own page for someone who may edit it: the
 * title, summary, and content become editable in place (inline-fields.tsx)
 * and save on their own a second after typing stops, under the same rules
 * as the /app editor (use-autosave.ts): one version per editing session, and
 * a save never overwrites someone else's newer one.
 */
export function PageInlineEditor({ artifact: loaded, reviewed, onSaved, save, children }: PageInlineEditorProps) {
  const [artifact, setArtifact] = useState(loaded);
  const { draft, update, replace, reset, remount, revision } = useArtifactDraft(artifact);
  const onUpdated = useCallback((next: ArtifactDto) => {
    setArtifact(next);
    onSaved(next);
  }, [onSaved]);
  const autosave = useAutosave({ artifact, draft, replaceDraft: replace, onUpdated, save });
  const [sourceOpen, setSourceOpen] = useState(false);
  useLeaveGuard(autosave.dirty || autosave.status.kind === "saving");

  const toggleSource = useCallback(() => {
    // Back from the source, editors that keep their own state reload what was typed there.
    if (sourceOpen) remount();
    setSourceOpen(!sourceOpen);
  }, [sourceOpen, remount]);

  const value = useMemo<PageEdit>(() => ({
    artifact,
    draft,
    update,
    revision,
    sourceOpen,
    showSource: () => { if (!sourceOpen) toggleSource(); },
  }), [artifact, draft, update, revision, sourceOpen, toggleSource]);

  const restored = (next: ArtifactDto) => {
    reset(next);
    onUpdated(next);
  };

  return (
    <PageEditContext value={value}>
      <PageEditBar
        history={
          <VersionHistory
            publicId={artifact.publicId}
            title={draft.title}
            updatedAt={artifact.updatedAt}
            reviewed={reviewed}
            files={artifact.files}
            hasUnsavedChanges={autosave.dirty}
            onRestored={restored}
          />
        }
        status={<SaveLine status={autosave.status} dirty={autosave.dirty} onRetry={autosave.retryNow} />}
        source={{ open: sourceOpen, onToggle: toggleSource }}
      />
      <ConflictNotice status={autosave.status} onLoadTheirs={autosave.loadTheirs} onKeepMine={autosave.keepMine} className="mb-6 rounded-lg border sm:px-4" />
      {children}
    </PageEditContext>
  );
}
