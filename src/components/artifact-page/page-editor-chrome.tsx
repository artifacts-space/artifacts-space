"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";

import type { SourceToggle } from "@/components/app/artifact-editor/editor-toolbar";
import { AgentSaveNotice, ConflictNotice, openHistoryButton } from "@/components/app/artifact-editor/save-status";
import type { AutosaveStatus } from "@/components/app/artifact-editor/use-autosave";
import type { HarnessControl } from "@/components/harness/use-artifact-harness";
import { VersionHistory, type VersionHistoryProps } from "@/components/history/version-history";
import type { FileDto } from "@/lib/files/types";

import { ownSaveBase } from "./restore-base-rules";
import { idleSave, saveProblem, type SaveIndicatorState } from "./save-indicator-rules";
import type { PageFullWidthControl } from "./use-page-full-width";

/** A conflict with someone else's newer save, and the two ways out of it. */
export interface PageConflict {
  status: AutosaveStatus;
  onLoadTheirs: () => void;
  onKeepMine: () => void;
}

/**
 * What the in-place editor on an artifact's page shows outside the
 * artifact itself: the page header's save indicator and More menu (Full
 * width, History, View source, Made with), and the notice about a conflicting save.
 */
export interface PageEditorChrome {
  /** History's dialog, with the restore check for the version the editor sees. */
  history: Omit<VersionHistoryProps, "trigger" | "className">;
  /** View source; null while the editable copy loads. */
  source: SourceToggle | null;
  /** The "Full width" setting; pending (so disabled) while the editable copy loads, and busy only while that wait can end. */
  fullWidth: PageFullWidthControl;
  save: SaveIndicatorState;
  /** Set only while a save conflicts with someone else's newer one. */
  conflict: PageConflict | null;
  /** Set after the editor's save went through over an agent's newer save (theirs is in History), until dismissed. */
  agentSaved: { onDismiss: () => void } | null;
  /** "Made with": the agent harness the artifact shows; null while the editable copy loads. */
  harness: HarnessControl | null;
}

const ChromeContext = createContext<PageEditorChrome | null>(null);
const PublishContext = createContext<((chrome: PageEditorChrome | null) => void) | null>(null);
/** This page's own cover, icon, and theme saves: the save time each moved the artifact from, to the time it moved it to. */
const OwnSavesContext = createContext<ReadonlyMap<string, string>>(new Map());
const NoteOwnSaveContext = createContext<((savedFrom: string, savedAt: string) => void) | null>(null);

/**
 * Holds the page editor's chrome for the whole artifact page, so the header
 * above the artifact can show what the editor below it publishes. Readers'
 * pages publish nothing, and the header then shows no editing controls.
 */
export function PageEditorChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<PageEditorChrome | null>(null);
  const [ownSaves, setOwnSaves] = useState<ReadonlyMap<string, string>>(() => new Map());
  const noteOwnSave = useCallback((savedFrom: string, savedAt: string) => {
    setOwnSaves((current) => new Map(current).set(savedFrom, savedAt));
  }, []);
  return (
    <PublishContext value={setChrome}>
      <NoteOwnSaveContext value={noteOwnSave}>
        <OwnSavesContext value={ownSaves}>
          <ChromeContext value={chrome}>{children}</ChromeContext>
        </OwnSavesContext>
      </NoteOwnSaveContext>
    </PublishContext>
  );
}

/** This page's own cover, icon, and theme saves, for History's restore check (restore-base-rules.ts). */
export function useOwnSaves(): ReadonlyMap<string, string> {
  return useContext(OwnSavesContext);
}

/**
 * Records a cover, icon, or theme save made from this page, so the editor's
 * restore check moves across it. Outside an artifact page it does nothing.
 */
export function useNoteOwnSave(): (times: { savedFrom: string; savedAt: string }) => void {
  const note = useContext(NoteOwnSaveContext);
  return useCallback((times) => { note?.(times.savedFrom, times.savedAt); }, [note]);
}

/** The page editor's chrome, or null for readers and before the editor starts. */
export function usePageEditorChrome(): PageEditorChrome | null {
  return useContext(ChromeContext);
}

/**
 * Publishes the editor's chrome to the page header while the caller is
 * mounted. Pass null to publish nothing. Outside a provider it does nothing.
 */
export function usePublishPageEditorChrome(chrome: PageEditorChrome | null) {
  const publish = useContext(PublishContext);
  useEffect(() => {
    if (!publish || !chrome) return;
    publish(chrome);
    return () => { publish(null); };
  }, [publish, chrome]);
}

/** What the server knows about the artifact, for the header's controls before the editable copy loads. */
export interface WaitingChromeInput {
  publicId: string;
  title: string;
  /** The latest save's time, for History's restore check. */
  updatedAt: string;
  /** Link and public artifacts: a restore may wait for approval. */
  reviewed: boolean;
  /** The "Full width" setting, shown but not yet changeable. */
  fullWidth: boolean;
  files: readonly FileDto[];
}

const unchangeable = () => undefined;

/**
 * The header's controls while the editable copy loads (or after it failed
 * to, with `error`): History works, Full width shows the page's setting
 * without changing it, and View source waits. Built from server data, so
 * the "⋯" works from the first paint after hydration, even while the page's
 * other requests are still on their way.
 */
export function useWaitingChrome(input: WaitingChromeInput | null, error: string): PageEditorChrome | null {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const refresh = useCallback(() => { startRefresh(() => { router.refresh(); }); }, [router]);
  const ownSaves = useOwnSaves();
  return useMemo(() => {
    if (!input) return null;
    const { publicId, title, updatedAt, reviewed, fullWidth, files } = input;
    return {
      history: { publicId, title, updatedAt: ownSaveBase(updatedAt, ownSaves), reviewed, files, onRestored: refresh },
      source: null,
      // A copy that failed to load is not on its way: the item is unavailable, not busy.
      fullWidth: { checked: fullWidth, pending: true, busy: !error, onChange: unchangeable },
      save: error ? saveProblem(error) : idleSave,
      conflict: null,
      agentSaved: null,
      harness: null,
    };
  }, [input, error, refresh, ownSaves]);
}

/**
 * The notices about someone else's newer save, under the title on the
 * artifact's page: a conflict with another person's save, or that this
 * editor's save went over an agent's (with a way into History). Nothing
 * shows without one.
 */
export function PageConflictNotice() {
  const chrome = usePageEditorChrome();
  if (!chrome) return null;
  const { conflict, agentSaved, history } = chrome;
  return (
    <>
      {conflict ? <ConflictNotice status={conflict.status} onLoadTheirs={conflict.onLoadTheirs} onKeepMine={conflict.onKeepMine} className="mt-6 rounded-lg border sm:px-4" /> : null}
      <AgentSaveNotice
        show={agentSaved !== null}
        onDismiss={agentSaved?.onDismiss ?? noop}
        history={<VersionHistory {...history} trigger={openHistoryButton} />}
        className="mt-6 rounded-lg border sm:px-4"
      />
    </>
  );
}

const noop = () => undefined;
