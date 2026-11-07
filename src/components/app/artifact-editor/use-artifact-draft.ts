import { useCallback, useState } from "react";

import type { ArtifactDto, ArtifactKind } from "@/lib/artifact-types";

/** The fields a person can edit in the artifact editor. */
export interface ArtifactDraft {
  title: string;
  /** One emoji or "tabler:<name>"; null for none. */
  icon: string | null;
  summary: string;
  content: string;
  language: string;
  kind: ArtifactKind;
}

const draftKeys = ["title", "icon", "summary", "content", "language", "kind"] as const satisfies readonly (keyof ArtifactDraft)[];

function draftFrom(artifact: ArtifactDto): ArtifactDraft {
  return {
    title: artifact.title,
    icon: artifact.icon,
    summary: artifact.summary,
    content: artifact.content,
    language: artifact.language,
    kind: artifact.kind,
  };
}

/** Holds the editable copy of an artifact and reports whether it differs from the saved one. */
export function useArtifactDraft(artifact: ArtifactDto) {
  const [draft, setDraft] = useState<ArtifactDraft>(() => draftFrom(artifact));

  const update = useCallback(<K extends keyof ArtifactDraft>(key: K, value: ArtifactDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  const dirty = draftKeys.some((key) => draft[key] !== artifact[key]);

  /** Replaces the draft with a saved artifact, such as a restored version. */
  const reset = useCallback((saved: ArtifactDto) => { setDraft(draftFrom(saved)); }, []);

  return { draft, update, dirty, reset };
}
