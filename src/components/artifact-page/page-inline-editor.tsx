"use client";

import { IconAlertTriangle, IconCode, IconDots } from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";

import { ConflictNotice, saveStatusLabel } from "@/components/app/artifact-editor/save-status";
import { useArtifactDraft, type ArtifactDraft } from "@/components/app/artifact-editor/use-artifact-draft";
import { useAutosave, type AutosaveStatus, type SaveArtifact } from "@/components/app/artifact-editor/use-autosave";
import { VersionHistory } from "@/components/history/version-history";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ArtifactDto } from "@/lib/artifact-types";
import { cn } from "@/lib/utils";

import { HarnessMenu } from "@/components/harness/harness-menu";
import { useArtifactHarness } from "@/components/harness/use-artifact-harness";

import { FullWidthToggle } from "./full-width-toggle";
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
  /** The Full width switch; empty while the editable copy loads. */
  width?: React.ReactNode;
  /** More menu entries after View source, such as "Made with"; empty while the editable copy loads. */
  more?: React.ReactNode;
}

/**
 * The row above an artifact its viewer may edit: the save status, Full
 * width, History, and More (View source). There is no Edit button and no Save button: the
 * artifact is editable where it reads, and changes save on their own.
 */
export function PageEditBar({ history, status, source, width, more }: PageEditBarProps) {
  return (
    <div data-slot="editor-bar" className="mb-6 flex min-h-8 items-center justify-end gap-1">
      {status ?? <span className="mr-auto" />}
      {width ? <span className="mr-2 shrink-0">{width}</span> : null}
      {history}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More actions" disabled={!source} />}>
          <IconDots />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={source?.onToggle} className="py-2">
            <IconCode /> {source?.open ? "Hide source" : "View source"}
          </DropdownMenuItem>
          {more}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * An empty draft that only fills the draft state until the editable copy
 * loads. Nothing shows it: `value` stays null while `artifact` is null, and
 * the edit controls mount only once it has loaded.
 */
const placeholderDraft: ArtifactDraft = { title: "", icon: null, summary: "", content: "", language: "", kind: "markdown" };

/**
 * The in-place edit state of an artifact page: the latest saved copy (null
 * while it loads), the draft, and View source. It lives above the page's
 * heading and body, so they keep their place in the tree when editing
 * unlocks, and a menu or picker opened before then stays open.
 */
export function usePageEditor(initial: ArtifactDto | null, onSaved: (artifact: ArtifactDto) => void) {
  const [artifact, setArtifact] = useState(initial);
  const { draft, update, replace, reset, remount, revision } = useArtifactDraft(initial ?? placeholderDraft);
  const [sourceOpen, setSourceOpen] = useState(false);

  const onUpdated = useCallback((next: ArtifactDto) => {
    setArtifact(next);
    onSaved(next);
  }, [onSaved]);

  /** Unlocks editing with the editable copy once it has loaded. */
  const start = useCallback((loaded: ArtifactDto) => {
    setArtifact(loaded);
    reset(loaded);
  }, [reset]);

  const restored = useCallback((next: ArtifactDto) => {
    reset(next);
    onUpdated(next);
  }, [reset, onUpdated]);

  const toggleSource = useCallback(() => {
    // Back from the source, editors that keep their own state reload what was typed there.
    if (sourceOpen) remount();
    setSourceOpen(!sourceOpen);
  }, [sourceOpen, remount]);

  // Null until the editable copy loads: the heading and body then show the read view, never the placeholder draft.
  const value = useMemo<PageEdit | null>(() => artifact && ({
    artifact,
    draft,
    update,
    revision,
    sourceOpen,
    showSource: () => { if (!sourceOpen) toggleSource(); },
  }), [artifact, draft, update, revision, sourceOpen, toggleSource]);

  return { artifact, draft, replace, sourceOpen, toggleSource, onUpdated, restored, start, value };
}

type PageEditor = ReturnType<typeof usePageEditor>;

interface PageEditControlsProps {
  artifact: ArtifactDto;
  editor: PageEditor;
  reviewed: boolean;
  save?: SaveArtifact | undefined;
}

/** The edit bar and conflict notice once the editable copy has loaded, with autosave. */
function PageEditControls({ artifact, editor, reviewed, save }: PageEditControlsProps) {
  const autosave = useAutosave({ artifact, draft: editor.draft, replaceDraft: editor.replace, onUpdated: editor.onUpdated, save });
  const harness = useArtifactHarness(artifact, editor.onUpdated);
  useLeaveGuard(autosave.dirty || autosave.status.kind === "saving");
  return (
    <>
      <PageEditBar
        history={
          <VersionHistory
            publicId={artifact.publicId}
            title={editor.draft.title}
            updatedAt={artifact.updatedAt}
            reviewed={reviewed}
            files={artifact.files}
            hasUnsavedChanges={autosave.dirty}
            onRestored={editor.restored}
          />
        }
        status={<SaveLine status={autosave.status} dirty={autosave.dirty} onRetry={autosave.retryNow} />}
        source={{ open: editor.sourceOpen, onToggle: editor.toggleSource }}
        width={<FullWidthToggle artifact={artifact} />}
        more={<HarnessMenu control={harness} />}
      />
      <ConflictNotice status={autosave.status} onLoadTheirs={autosave.loadTheirs} onKeepMine={autosave.keepMine} className="mb-6 rounded-lg border sm:px-4" />
    </>
  );
}

interface PageEditFrameProps {
  editor: PageEditor;
  /** Link and public artifacts: edits and restores may wait for approval. */
  reviewed: boolean;
  /** Sends a save; the dev fixture passes a stand-in. Defaults to the web save action. */
  save?: SaveArtifact | undefined;
  /** The bar shown while the editable copy loads. */
  loadingBar?: React.ReactNode;
  /** The page's heading and body, which read the edit state through PageEditContext. */
  children: React.ReactNode;
}

/**
 * The edit bar above the page's heading and body. The heading and body sit
 * in the same place whether or not the editable copy has loaded, so React
 * never remounts them (and the icon, theme, and cover pickers in the
 * heading never close) when editing unlocks.
 */
export function PageEditFrame({ editor, reviewed, save, loadingBar, children }: PageEditFrameProps) {
  return (
    <PageEditContext value={editor.value}>
      {editor.artifact ? <PageEditControls artifact={editor.artifact} editor={editor} reviewed={reviewed} save={save} /> : loadingBar}
      {children}
    </PageEditContext>
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
  save?: SaveArtifact | undefined;
  /** The page's heading and body, which read the edit state through PageEditContext. */
  children: React.ReactNode;
}

/**
 * Unlocks an artifact on its own page for someone who may edit it: the
 * title, summary, and content become editable in place (inline-fields.tsx)
 * and save on their own a second after typing stops, under the same rules
 * as the /app editor (use-autosave.ts): one version per editing session, and
 * a save never overwrites someone else's newer one. For an artifact already
 * loaded; the artifact page loads its copy through EditSurface.
 */
export function PageInlineEditor({ artifact, reviewed, onSaved, save, children }: PageInlineEditorProps) {
  const editor = usePageEditor(artifact, onSaved);
  return <PageEditFrame editor={editor} reviewed={reviewed} save={save}>{children}</PageEditFrame>;
}
