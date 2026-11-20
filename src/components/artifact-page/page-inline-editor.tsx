"use client";

import { useCallback, useMemo, useState } from "react";

import { useArtifactDraft, type ArtifactDraft } from "@/components/app/artifact-editor/use-artifact-draft";
import { useAutosave, type SaveArtifact } from "@/components/app/artifact-editor/use-autosave";
import { useCatchUp, useCaughtUp, type CaughtUp } from "@/components/app/artifact-editor/use-catch-up";
import type { SignalEditing } from "@/components/app/artifact-editor/use-editing-signal";
import { useArtifactHarness } from "@/components/harness/use-artifact-harness";
import { askToAttach } from "@/components/files/attach-bridge";
import type { ArtifactDto } from "@/lib/artifact-types";
import { attachesBeside, attachLabel } from "@/lib/files/loose-rules";

import { PageEditContext, type PageEdit } from "./page-edit-context";
import { useOwnSaves, usePublishPageEditorChrome, type PageEditorChrome } from "./page-editor-chrome";
import { ownSaveBase } from "./restore-base-rules";
import { saveIndicatorFor } from "./save-indicator-rules";
import { usePageFullWidth } from "./use-page-full-width";
import { useLeaveGuard } from "./use-leave-guard";

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
export function usePageEditor(initial: ArtifactDto | null, onSaved: (artifact: ArtifactDto) => void, onAutosaved: (artifact: ArtifactDto) => void = onSaved) {
  const [artifact, setArtifact] = useState(initial);
  const { draft, update, replace, reset, remount, revision } = useArtifactDraft(initial ?? placeholderDraft);
  const [sourceOpen, setSourceOpen] = useState(false);

  const onUpdated = useCallback((next: ArtifactDto) => {
    setArtifact(next);
    onSaved(next);
  }, [onSaved]);
  /** An autosave's answer: the editor already shows it, so the page around it can catch up later (`onAutosaved`). */
  const autosaved = useCallback((next: ArtifactDto) => {
    setArtifact(next);
    onAutosaved(next);
  }, [onAutosaved]);

  /** Unlocks editing with the editable copy once it has loaded. */
  const start = useCallback((loaded: ArtifactDto) => {
    setArtifact(loaded);
    reset(loaded);
  }, [reset]);

  /** Back to the read view until `start` is called again: for a page that was away and must load its editable copy anew. */
  const lock = useCallback(() => { setArtifact(null); }, []);

  const restored = useCallback((next: ArtifactDto) => {
    reset(next);
    onUpdated(next);
  }, [reset, onUpdated]);

  // A newer save the page took when its tab came back (use-catch-up.tsx): the notice, and the canvas frames to mark.
  const { caughtUp, setCaughtUp, dismiss: dismissCaughtUp } = useCaughtUp(artifact?.id ?? "");
  const caughtUpWith = useCallback((next: ArtifactDto, note: CaughtUp) => {
    onUpdated(next);
    setCaughtUp(note);
  }, [onUpdated, setCaughtUp]);
  const changedFrames = caughtUp?.frames;

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
    onUpdated,
    revision,
    sourceOpen,
    showSource: () => { if (!sourceOpen) toggleSource(); },
    hideSource: () => { if (sourceOpen) toggleSource(); },
    changedFrames,
  }), [artifact, draft, update, onUpdated, revision, sourceOpen, toggleSource, changedFrames]);

  return { artifact, draft, replace, sourceOpen, toggleSource, onUpdated, autosaved, restored, start, lock, value, caughtUp, caughtUpWith, dismissCaughtUp };
}

type PageEditor = ReturnType<typeof usePageEditor>;

interface PageEditControlsProps {
  artifact: ArtifactDto;
  editor: PageEditor;
  reviewed: boolean;
  pageFullWidth?: boolean | undefined;
  save?: SaveArtifact | undefined;
  /** Sends "I'm editing"; the dev fixture passes a stand-in. Defaults to the web action. */
  signalEditing?: SignalEditing | undefined;
}

/**
 * Autosave and the editor's controls once the editable copy has loaded. It
 * draws nothing here: it publishes the save status, Full width, History,
 * View source, and "Made with" to the page header, and a conflicting save to the notice under
 * the title (page-editor-chrome.tsx).
 */
function PageEditControls({ artifact, editor, reviewed, pageFullWidth, save, signalEditing }: PageEditControlsProps) {
  const autosave = useAutosave({ artifact, draft: editor.draft, replaceDraft: editor.replace, onUpdated: editor.autosaved, save, signalEditing });
  useLeaveGuard(autosave.dirty || autosave.status.kind === "saving");
  const fullWidth = usePageFullWidth(artifact, pageFullWidth);
  const { status, dirty, retryNow, loadTheirs, keepMine, agentSaved, dismissAgentSaved } = autosave;
  const { restored, sourceOpen, toggleSource, caughtUp, caughtUpWith, dismissCaughtUp } = editor;
  const ownSaves = useOwnSaves();
  // The person's own cover, icon, or theme save is not news: ask from the newest save this tab made.
  useCatchUp({ artifact, knownUpdatedAt: ownSaveBase(artifact.updatedAt, ownSaves), stored: true, unsaved: dirty || status.kind === "saving", onCaughtUp: caughtUpWith });
  const harness = useArtifactHarness(artifact, editor.onUpdated);
  // "Attach file" ("Add files" on a web page) for a format that keeps attachments beside its content; the page's list of attached files answers it (page-attached-files.tsx).
  const attachable = attachesBeside(editor.draft.kind);
  const attachName = attachLabel(editor.draft.kind);
  const attach = useMemo(() => (attachable ? { label: attachName, run: () => { askToAttach(artifact.id); } } : null), [attachable, attachName, artifact.id]);
  const chrome = useMemo<PageEditorChrome>(() => ({
    history: {
      publicId: artifact.publicId,
      // The saved title, as in /app: the header republishes on each save, not on each keystroke in the title.
      title: artifact.title,
      // Cover, icon, and theme save through their own actions and leave the editor's copy at its older time; the restore check follows them.
      updatedAt: ownSaveBase(artifact.updatedAt, ownSaves),
      reviewed,
      files: artifact.files,
      hasUnsavedChanges: dirty,
      onRestored: restored,
    },
    source: { open: sourceOpen, onToggle: toggleSource },
    fullWidth,
    save: saveIndicatorFor(status, dirty, retryNow),
    conflict: status.kind === "conflict" ? { status, onLoadTheirs: loadTheirs, onKeepMine: keepMine } : null,
    agentSaved: agentSaved ? { onDismiss: dismissAgentSaved } : null,
    caughtUp: caughtUp ? { words: caughtUp.words, onDismiss: dismissCaughtUp } : null,
    harness,
    attach,
  }), [attach, caughtUp, dismissCaughtUp, artifact, ownSaves, reviewed, dirty, restored, sourceOpen, toggleSource, fullWidth, status, retryNow, loadTheirs, keepMine, agentSaved, dismissAgentSaved, harness]);
  usePublishPageEditorChrome(chrome);
  return null;
}

interface PageEditFrameProps {
  editor: PageEditor;
  /** Link and public artifacts: edits and restores may wait for approval. */
  reviewed: boolean;
  /** The width the server-rendered page has, which the Full width checkbox shows. The dev fixture has none. */
  pageFullWidth?: boolean | undefined;
  /** Sends a save; the dev fixture passes a stand-in. Defaults to the web save action. */
  save?: SaveArtifact | undefined;
  /** Sends "I'm editing"; the dev fixture passes a stand-in. Defaults to the web action. */
  signalEditing?: SignalEditing | undefined;
  /** The page's heading and body, which read the edit state through PageEditContext. */
  children: React.ReactNode;
}

/**
 * The edit state around the page's heading and body. The heading and body
 * sit in the same place whether or not the editable copy has loaded, so
 * React never remounts them (and the icon, theme, and cover pickers in the
 * heading never close) when editing unlocks.
 */
export function PageEditFrame({ editor, reviewed, pageFullWidth, save, signalEditing, children }: PageEditFrameProps) {
  return (
    <PageEditContext value={editor.value}>
      {editor.artifact ? <PageEditControls artifact={editor.artifact} editor={editor} reviewed={reviewed} pageFullWidth={pageFullWidth} save={save} signalEditing={signalEditing} /> : null}
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
  /** Sends "I'm editing"; the dev fixture passes a stand-in. Defaults to the web action. */
  signalEditing?: SignalEditing | undefined;
  /** The page's heading and body, which read the edit state through PageEditContext. */
  children: React.ReactNode;
}

/**
 * Unlocks an artifact on its own page for someone who may edit it: the
 * title, summary, and content become editable in place (inline-fields.tsx)
 * and save on their own a second after typing stops, under the same rules
 * as the /app editor (use-autosave.ts): one version per editing session, and
 * a save never overwrites someone else's newer one. The save status, Full
 * width, History, and View source go to the page header. For an artifact
 * already loaded; the artifact page loads its copy through EditSurface.
 */
export function PageInlineEditor({ artifact, reviewed, onSaved, save, signalEditing, children }: PageInlineEditorProps) {
  const editor = usePageEditor(artifact, onSaved);
  return <PageEditFrame editor={editor} reviewed={reviewed} save={save} signalEditing={signalEditing}>{children}</PageEditFrame>;
}
