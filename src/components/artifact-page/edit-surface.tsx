"use client";

import { useEffect, useMemo, useState } from "react";

import { loadEditableArtifactAction } from "@/app/artifact/[publicId]/edit-actions";
import { serverCaptureApi } from "@/components/artifact-view/canvas/capture/capture-api";
import { ServerCatchUp } from "@/components/app/artifact-editor/use-catch-up";
import { useQuietRefresh } from "@/components/app/artifact-editor/use-quiet-refresh";
import { FrameCaptureHost } from "@/components/artifact-view/canvas/capture/frame-capture-host";
import type { FileDto } from "@/lib/files/types";

import { usePublishPageEditorChrome, useWaitingChrome } from "./page-editor-chrome";
import { PageEditFrame, usePageEditor } from "./page-inline-editor";

interface EditSurfaceProps {
  publicId: string;
  title: string;
  /** The latest save's time, for History's restore check. */
  updatedAt: string;
  /** Link and public artifacts: edits and restores may wait for approval. */
  reviewed: boolean;
  /** The page's "Full width" setting: shown (not yet changeable) while the editable copy loads, then what the header's checkbox ticks. */
  fullWidth: boolean;
  files: readonly FileDto[];
  /** The artifact as readers see it. Its title, summary, and body unlock once the editable copy loads. */
  children: React.ReactNode;
}

const loadFailed = "Editing is not available right now. Reload the page to try again.";

/**
 * The artifact page for a signed-in editor. The page renders this only for
 * someone who may edit; it loads the latest saved copy itself, so nothing
 * editable is ever part of a cached page. Until that copy arrives the page
 * shows the read view, and the header's More menu offers History; then the
 * same page is editable in place (PageEditFrame) with no Edit button.
 */
export function EditSurface({ publicId, title, updatedAt, reviewed, fullWidth, files, children }: EditSurfaceProps) {
  const [error, setError] = useState("");
  // The page around the editor catches up once the typing stops; a restore or a newer save from the server shows at once.
  const refresh = useQuietRefresh();
  const editor = usePageEditor(null, refresh.now, refresh.soon);
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

  const waitingInput = useMemo(() => ({ publicId, title, updatedAt, reviewed, fullWidth, files }), [publicId, title, updatedAt, reviewed, fullWidth, files]);
  const failed = useWaitingChrome(waitingInput, error);
  // The header builds the waiting controls itself; this tells it only when the editable copy could not load. Once loaded, PageEditFrame's controls publish their own.
  usePublishPageEditorChrome(!editor.artifact && error ? failed : null);

  const loaded = editor.artifact;
  // One frame for both states: the heading and body never remount when editing unlocks.
  return (
    <>
      {/* A canvas or interface takes a newer save when the tab comes back. This page is rendered only for someone who may edit. */}
      <ServerCatchUp>
        <PageEditFrame editor={editor} reviewed={reviewed} pageFullWidth={fullWidth}>{children}</PageEditFrame>
      </ServerCatchUp>
      {/* Draws the frames of a canvas for agents, out of sight, once the editable copy has loaded. This page is rendered only for someone who may edit. */}
      <FrameCaptureHost artifactId={loaded?.id ?? null} kind={loaded?.kind ?? ""} savedAt={loaded?.updatedAt ?? null} api={serverCaptureApi} />
    </>
  );
}
