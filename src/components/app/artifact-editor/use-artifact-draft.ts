import { useCallback, useState } from "react";

import type { ArtifactDto, ArtifactKind } from "@/lib/artifact-types";

/** The fields a person can edit in the artifact editor. */
export interface ArtifactDraft {
  title: string;
  summary: string;
  content: string;
  project: string;
  language: string;
  kind: ArtifactKind;
}

const draftKeys = ["title", "summary", "content", "project", "language", "kind"] as const satisfies readonly (keyof ArtifactDraft)[];

function draftFrom(artifact: ArtifactDto): ArtifactDraft {
  return {
    title: artifact.title,
    summary: artifact.summary,
    content: artifact.content,
    project: artifact.project,
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

  return { draft, update, dirty };
}
