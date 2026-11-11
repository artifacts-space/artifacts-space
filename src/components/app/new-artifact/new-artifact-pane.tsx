"use client";

import { useState } from "react";

import { ArtifactEditor } from "@/components/app/artifact-editor/artifact-editor";
import { useEditAccess } from "@/components/app/use-edit-access";
import type { ArtifactDto } from "@/lib/artifact-types";
import { BLANK_ARTIFACT_ID } from "@/lib/create/new-artifact-rules";

import type { NewArtifactApi } from "./new-artifact-api";

/** The artifact the editor holds before anything is stored: private, empty Markdown by the viewer. Never sent anywhere. */
export function blankArtifact(viewerId: string, now: string): ArtifactDto {
  return {
    id: BLANK_ARTIFACT_ID,
    publicId: "",
    title: "",
    icon: null,
    theme: null,
    cover: null,
    fullWidth: false,
    sheetFormat: { banding: null, align: {} },
    allowCsvDownload: false,
    summary: "",
    content: "",
    kind: "markdown",
    language: "",
    project: null,
    tags: [],
    sessionId: "",
    source: "web",
    harness: null,
    visibility: "private",
    comments: "off",
    showInSearch: false,
    teamId: null,
    authorId: viewerId,
    originalAuthorId: null,
    pendingSharing: null,
    pendingEdit: null,
    pendingComments: null,
    files: [],
    updatedBy: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

interface NewArtifactPaneProps {
  viewerId: string;
  origin: string;
  api: NewArtifactApi;
  /** The project the list is filtered to; the new artifact goes into it. */
  project: string | null;
  /** Which blank page this is, so a save that lands after it was left never reopens it. */
  sessionKey: number;
  focusRequest: number;
  /** Every save: the first one is the create, so the list gains the artifact then. */
  onSaved: (sessionKey: number, artifact: ArtifactDto) => void;
  onDeleted: (id: string) => void;
}

/**
 * The blank page New artifact opens: the usual editor, on an artifact that
 * does not exist until the person puts something in it. The same editor
 * stays mounted after the create, so the cursor and anything typed while it
 * was being stored stay where they are.
 */
export function NewArtifactPane({ viewerId, origin, api, project, sessionKey, focusRequest, onSaved, onDeleted }: NewArtifactPaneProps) {
  const [blank] = useState(() => blankArtifact(viewerId, new Date().toISOString()));
  const [stored, setStored] = useState<ArtifactDto | null>(null);
  const [blankPage] = useState(() => ({ api, project }));
  const access = useEditAccess(stored, viewerId);
  const saved = (artifact: ArtifactDto) => {
    setStored(artifact);
    onSaved(sessionKey, artifact);
  };
  return (
    <ArtifactEditor
      artifact={stored ?? blank}
      origin={origin}
      canShare={stored ? access.canShare : false}
      canDelete={stored ? access.canDelete : false}
      team={access.team}
      seesComments={stored ? access.seesComments : true}
      onWithdraw={null}
      onUpdated={saved}
      onDeleted={onDeleted}
      blankPage={blankPage}
      focusRequest={focusRequest}
    />
  );
}
