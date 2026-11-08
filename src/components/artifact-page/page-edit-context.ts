"use client";

import { createContext, useContext } from "react";

import type { ArtifactDraft } from "@/components/app/artifact-editor/use-artifact-draft";
import type { ArtifactDto } from "@/lib/artifact-types";

/**
 * The artifact being edited in place on its own page, shared by the title,
 * summary, and content (inline-fields.tsx). Null for readers who may not
 * edit, and while the editable copy loads: those parts then render the
 * server's read view unchanged.
 */
export interface PageEdit {
  /** The latest saved artifact. */
  artifact: ArtifactDto;
  /** What the editor typed, saved on its own a moment after typing stops. */
  draft: ArtifactDraft;
  update: <K extends keyof ArtifactDraft>(key: K, value: ArtifactDraft[K]) => void;
  /** Changes when the content was replaced from outside, so stateful editors reload it. */
  revision: number;
  /** View source is open: the raw content replaces the rendered artifact. */
  sourceOpen: boolean;
  showSource: () => void;
}

export const PageEditContext = createContext<PageEdit | null>(null);

/** The in-place edit state on an artifact page, or null when the viewer reads it. */
export function usePageEdit(): PageEdit | null {
  return useContext(PageEditContext);
}
