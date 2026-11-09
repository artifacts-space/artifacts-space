"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { SourceToggle } from "@/components/app/artifact-editor/editor-toolbar";
import { ConflictNotice } from "@/components/app/artifact-editor/save-status";
import type { AutosaveStatus } from "@/components/app/artifact-editor/use-autosave";
import type { FullWidthControl } from "@/components/app/artifact-editor/use-full-width";
import type { VersionHistoryProps } from "@/components/history/version-history";

import type { SaveIndicatorState } from "./save-indicator-rules";

/** A conflict with someone else's newer save, and the two ways out of it. */
export interface PageConflict {
  status: AutosaveStatus;
  onLoadTheirs: () => void;
  onKeepMine: () => void;
}

/**
 * What the in-place editor on an artifact's page shows outside the
 * artifact itself: the page header's save indicator and More menu (Full
 * width, History, View source), and the notice about a conflicting save.
 */
export interface PageEditorChrome {
  /** History's dialog, with the restore check for the version the editor sees. */
  history: Omit<VersionHistoryProps, "trigger" | "className">;
  /** View source; null while the editable copy loads. */
  source: SourceToggle | null;
  /** The "Full width" setting; pending (so disabled) while the editable copy loads. */
  fullWidth: FullWidthControl;
  save: SaveIndicatorState;
  /** Set only while a save conflicts with someone else's newer one. */
  conflict: PageConflict | null;
}

const ChromeContext = createContext<PageEditorChrome | null>(null);
const PublishContext = createContext<((chrome: PageEditorChrome | null) => void) | null>(null);

/**
 * Holds the page editor's chrome for the whole artifact page, so the header
 * above the artifact can show what the editor below it publishes. Readers'
 * pages publish nothing, and the header then shows no editing controls.
 */
export function PageEditorChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<PageEditorChrome | null>(null);
  return (
    <PublishContext value={setChrome}>
      <ChromeContext value={chrome}>{children}</ChromeContext>
    </PublishContext>
  );
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

/** The notice about someone else's newer save, under the title on the artifact's page. Nothing shows without a conflict. */
export function PageConflictNotice() {
  const conflict = usePageEditorChrome()?.conflict;
  if (!conflict) return null;
  return <ConflictNotice status={conflict.status} onLoadTheirs={conflict.onLoadTheirs} onKeepMine={conflict.onKeepMine} className="mt-6 rounded-lg border sm:px-4" />;
}
