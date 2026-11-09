"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { loadEditableArtifactAction } from "@/app/artifact/[publicId]/edit-actions";
import type { ArtifactDto } from "@/lib/artifact-types";
import type { FileDto } from "@/lib/files/types";

import { usePublishPageEditorChrome, type PageEditorChrome } from "./page-editor-chrome";
import { PageInlineEditor } from "./page-inline-editor";
import { idleSave, saveProblem } from "./save-indicator-rules";

interface EditSurfaceProps {
  publicId: string;
  title: string;
  /** The latest save's time, for History's restore check. */
  updatedAt: string;
  /** Link and public artifacts: edits and restores may wait for approval. */
  reviewed: boolean;
  /** The page's "Full width" setting, shown (not yet changeable) while the editable copy loads. */
  fullWidth: boolean;
  files: readonly FileDto[];
  /** The artifact as readers see it. Its title, summary, and body unlock once the editable copy loads. */
  children: React.ReactNode;
}

const loadFailed = "Editing is not available right now. Reload the page to try again.";
const unchangeable = () => undefined;

/**
 * The artifact page for a signed-in editor. The page renders this only for
 * someone who may edit; it loads the latest saved copy itself, so nothing
 * editable is ever part of a cached page. Until that copy arrives the page
 * shows the read view, and the header's More menu offers History; then the
 * same page is editable in place (PageInlineEditor) with no Edit button.
 */
export function EditSurface({ publicId, title, updatedAt, reviewed, fullWidth, files, children }: EditSurfaceProps) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<ArtifactDto | null>(null);
  const [error, setError] = useState("");
  const [, startRefresh] = useTransition();

  useEffect(() => {
    let active = true;
    loadEditableArtifactAction(publicId)
      .then((result) => {
        if (!active) return;
        if (result.success) setLoaded(result.data);
        else setError(result.error);
      })
      .catch(() => { if (active) setError(loadFailed); });
    return () => { active = false; };
  }, [publicId]);

  const refresh = useCallback(() => { startRefresh(() => { router.refresh(); }); }, [router]);

  const waiting = useMemo<PageEditorChrome>(() => ({
    history: { publicId, title, updatedAt, reviewed, files, onRestored: refresh },
    source: null,
    fullWidth: { checked: fullWidth, pending: true, onChange: unchangeable },
    save: error ? saveProblem(error) : idleSave,
    conflict: null,
  }), [publicId, title, updatedAt, reviewed, files, refresh, fullWidth, error]);
  // Once the editable copy is here, PageInlineEditor publishes its own.
  usePublishPageEditorChrome(loaded ? null : waiting);

  if (loaded) {
    return <PageInlineEditor artifact={loaded} reviewed={reviewed} onSaved={refresh}>{children}</PageInlineEditor>;
  }
  return children;
}
