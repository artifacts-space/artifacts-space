"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { loadEditableArtifactAction } from "@/app/artifact/[publicId]/edit-actions";
import { VersionHistory } from "@/components/history/version-history";
import type { FileDto } from "@/lib/files/types";

import { PageEditBar, PageEditFrame, usePageEditor } from "./page-inline-editor";

interface EditSurfaceProps {
  publicId: string;
  title: string;
  /** The latest save's time, for History's restore check. */
  updatedAt: string;
  /** Link and public artifacts: edits and restores may wait for approval. */
  reviewed: boolean;
  files: readonly FileDto[];
  /** The artifact as readers see it. Its title, summary, and body unlock once the editable copy loads. */
  children: React.ReactNode;
}

const loadFailed = "Editing is not available right now. Reload the page to try again.";

/**
 * The artifact page for a signed-in editor. The page renders this only for
 * someone who may edit; it loads the latest saved copy itself, so nothing
 * editable is ever part of a cached page. Until that copy arrives the page
 * shows the read view; then the same page is editable in place
 * (PageEditFrame) with no Edit button.
 */
export function EditSurface({ publicId, title, updatedAt, reviewed, files, children }: EditSurfaceProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [, startRefresh] = useTransition();
  const refresh = useCallback(() => { startRefresh(() => { router.refresh(); }); }, [router]);
  const editor = usePageEditor(null, refresh);
  const { start } = editor;

  useEffect(() => {
    let active = true;
    loadEditableArtifactAction(publicId)
      .then((result) => {
        if (!active) return;
        if (result.success) start(result.data);
        else setError(result.error);
      })
      .catch(() => { if (active) setError(loadFailed); });
    return () => { active = false; };
  }, [publicId, start]);

  const loadingBar = (
    <PageEditBar
      history={<VersionHistory publicId={publicId} title={title} updatedAt={updatedAt} reviewed={reviewed} files={files} onRestored={refresh} />}
      status={error ? <p role="alert" className="mr-auto text-xs text-muted-foreground">{error}</p> : null}
      source={null}
    />
  );
  // One frame for both states: the heading and body never remount when editing unlocks.
  return <PageEditFrame editor={editor} reviewed={reviewed} loadingBar={loadingBar}>{children}</PageEditFrame>;
}
