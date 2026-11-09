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

/** Every editable field, in a fixed order. */
export const draftKeys = ["title", "icon", "summary", "content", "language", "kind"] as const satisfies readonly (keyof ArtifactDraft)[];

/** The editable fields of a saved artifact. */
export function draftFrom(artifact: Pick<ArtifactDto, keyof ArtifactDraft>): ArtifactDraft {
  return {
    title: artifact.title,
    icon: artifact.icon,
    summary: artifact.summary,
    content: artifact.content,
    language: artifact.language,
    kind: artifact.kind,
  };
}

/**
 * Holds the editable copy of an artifact. `revision` changes whenever the
 * draft is replaced from outside the content editor (a restore, a reload,
 * a merge that changed the content), so editors that keep their own state,
 * such as the rich Markdown editor, remount with the new content.
 */
export function useArtifactDraft(artifact: Pick<ArtifactDto, keyof ArtifactDraft>) {
  const [draft, setDraft] = useState<ArtifactDraft>(() => draftFrom(artifact));
  const [revision, setRevision] = useState(0);

  const update = useCallback(<K extends keyof ArtifactDraft>(key: K, value: ArtifactDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  /** Replaces the draft. `remount` reloads the content editor, for content that changed outside it. */
  const replace = useCallback((next: ArtifactDraft, remount: boolean) => {
    setDraft(next);
    if (remount) setRevision((count) => count + 1);
  }, []);

  /** Replaces the draft with a saved artifact, such as a restored version. */
  const reset = useCallback((saved: ArtifactDto) => { replace(draftFrom(saved), true); }, [replace]);

  /** Reloads the content editor from the draft, such as after editing the source. */
  const remount = useCallback(() => { setRevision((count) => count + 1); }, []);

  return { draft, update, replace, reset, remount, revision };
}
