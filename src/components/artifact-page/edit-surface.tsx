"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { loadEditableArtifactAction } from "@/app/artifact/[publicId]/edit-actions";
import { VersionHistory } from "@/components/history/version-history";
import type { ArtifactDto } from "@/lib/artifact-types";
import type { FileDto } from "@/lib/files/types";

import { PageEditBar, PageInlineEditor } from "./page-inline-editor";

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
 * (PageInlineEditor) with no Edit button.
 */
export function EditSurface({ publicId, title, updatedAt, reviewed, files, children }: EditSurfaceProps) {
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

  if (loaded) {
    return <PageInlineEditor artifact={loaded} reviewed={reviewed} onSaved={refresh}>{children}</PageInlineEditor>;
  }
  return (
    <div>
      <PageEditBar
        history={<VersionHistory publicId={publicId} title={title} updatedAt={updatedAt} reviewed={reviewed} files={files} onRestored={refresh} />}
        status={error ? <p role="alert" className="mr-auto text-xs text-muted-foreground">{error}</p> : null}
        source={null}
      />
      {children}
    </div>
  );
}
