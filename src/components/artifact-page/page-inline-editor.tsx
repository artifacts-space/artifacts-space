"use client";

import { useCallback, useMemo, useState } from "react";

import { useArtifactDraft } from "@/components/app/artifact-editor/use-artifact-draft";
import { useAutosave, type SaveArtifact } from "@/components/app/artifact-editor/use-autosave";
import type { ArtifactDto } from "@/lib/artifact-types";

import { PageEditContext, type PageEdit } from "./page-edit-context";
import { usePublishPageEditorChrome, type PageEditorChrome } from "./page-editor-chrome";
import { saveIndicatorFor } from "./save-indicator-rules";
import { usePageFullWidth } from "./use-page-full-width";
import { useLeaveGuard } from "./use-leave-guard";

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
 * a save never overwrites someone else's newer one. The save status, Full
 * width, History, and View source go to the page header (page-editor-chrome.tsx).
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

  const restored = useCallback((next: ArtifactDto) => {
    reset(next);
    onUpdated(next);
  }, [reset, onUpdated]);

  const fullWidth = usePageFullWidth(artifact);
  const { status, dirty, retryNow, loadTheirs, keepMine } = autosave;
  const chrome = useMemo<PageEditorChrome>(() => ({
    history: { publicId: artifact.publicId, title: draft.title, updatedAt: artifact.updatedAt, reviewed, files: artifact.files, hasUnsavedChanges: dirty, onRestored: restored },
    source: { open: sourceOpen, onToggle: toggleSource },
    fullWidth,
    save: saveIndicatorFor(status, dirty, retryNow),
    conflict: status.kind === "conflict" ? { status, onLoadTheirs: loadTheirs, onKeepMine: keepMine } : null,
  }), [artifact, draft.title, reviewed, dirty, restored, sourceOpen, toggleSource, fullWidth, status, retryNow, loadTheirs, keepMine]);
  // The save indicator, More menu, and conflict notice live in the page header and under the title.
  usePublishPageEditorChrome(chrome);

  return <PageEditContext value={value}>{children}</PageEditContext>;
}
