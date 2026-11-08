"use client";

import { useState } from "react";

import { CommentsControl } from "@/components/app/comments-picker";
import { ShareControl } from "@/components/app/share-control";
import type { ShareTeam } from "@/components/app/share-teams-context";
import { AttachedFiles } from "@/components/files/attached-files";
import { CommentsDialog } from "@/components/comments/comments-dialog";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { VersionHistory } from "@/components/history/version-history";
import { ArtifactOrganizers } from "@/components/projects/artifact-organizers";
import type { ArtifactDto } from "@/lib/artifact-types";

import { ContentPane } from "./content-pane";
import { detailBody, detailOuter, detailSection, stickyModeBar, useScrollPlace } from "./detail-scroll";
import {
  MetaFields,
  ModeBar,
  ShareBanner,
  TitleFields,
  type EditorMode,
} from "./editor-sections";
import { EditorToolbar } from "./editor-toolbar";
import { useArtifactActions } from "./use-artifact-actions";
import { useArtifactDraft } from "./use-artifact-draft";

interface ArtifactEditorProps {
  artifact: ArtifactDto;
  origin: string;
  /** False for a teammate editing an artifact shared through their team: no sharing or delete. */
  isAuthor: boolean;
  /** The author, or the person who added the agent that wrote it, changes who can read it. */
  canShare: boolean;
  /** The author, or the person who added the agent that wrote it, deletes it. */
  canDelete: boolean;
  /** The artifact's team, when the viewer belongs to it. */
  team: ShareTeam | undefined;
  /** The comments setting lets the viewer see its comments. */
  seesComments: boolean;
  /** A team owner or admin editing a teammate's artifact can make it private again. */
  onWithdraw: (() => void) | null;
  onUpdated: (artifact: ArtifactDto) => void;
  onDeleted: (id: string) => void;
}

interface SharingSlotProps {
  artifact: ArtifactDto;
  shareUrl: string;
  canShare: boolean;
  manager: boolean;
  team: ShareTeam | undefined;
  onUpdated: (artifact: ArtifactDto) => void;
}

/** The author's Share button, or the comments setting for a team owner or admin. Nothing for other teammates. */
function SharingSlot({ artifact, shareUrl, canShare, manager, team, onUpdated }: SharingSlotProps) {
  if (canShare) return <ShareControl artifact={artifact} shareUrl={shareUrl} onUpdated={onUpdated} />;
  if (manager) return <CommentsControl artifact={artifact} team={team} onUpdated={onUpdated} />;
  return null;
}

/** Edit one artifact and read its history. The author (or the person who added the agent that wrote it) also shares and deletes it. */
export function ArtifactEditor({ artifact, origin, isAuthor, canShare, canDelete, team, seesComments, onWithdraw, onUpdated, onDeleted }: ArtifactEditorProps) {
  const { draft, update, dirty, reset } = useArtifactDraft(artifact);
  const { pending, save, remove } = useArtifactActions({ artifact, draft, onUpdated, onDeleted });
  const [mode, setMode] = useState<EditorMode>("preview");
  const confirmDelete = useConfirm("deleteArtifact");
  const shareUrl = `${origin}/artifact/${artifact.publicId}`;
  const shared = artifact.visibility === "link" || artifact.visibility === "public";
  const { outerRef, bodyRef, remember } = useScrollPlace(mode);
  const changeMode = (next: EditorMode) => {
    remember();
    setMode(next);
  };

  return (
    <section className={detailSection} aria-label={`Edit ${artifact.title}`}>
      <EditorToolbar
        id={artifact.id}
        kind={draft.kind}
        content={artifact.content}
        shareControl={<SharingSlot artifact={artifact} shareUrl={shareUrl} canShare={canShare} manager={onWithdraw !== null} team={team} onUpdated={onUpdated} />}
        history={
          <VersionHistory
            publicId={artifact.publicId}
            title={artifact.title}
            updatedAt={artifact.updatedAt}
            reviewed={shared}
            files={artifact.files}
            hasUnsavedChanges={dirty}
            onRestored={(restored) => { reset(restored); onUpdated(restored); }}
          />
        }
        comments={
          <CommentsDialog
            publicId={artifact.publicId}
            title={artifact.title}
            seesComments={seesComments}
            offNotice={`Comments are off for this artifact.${canShare ? " Change who can comment in Share." : ""}`}
          />
        }
        dirty={dirty}
        pending={pending}
        onSave={() => void save()}
        onRequestDelete={canDelete ? () => { if (pending !== "delete") confirmDelete.request(remove); } : null}
        onWithdraw={onWithdraw}
      />
      <div ref={outerRef} data-slot="detail-outer" className={detailOuter}>
        {shared ? <ShareBanner shareUrl={shareUrl} isPublic={artifact.visibility === "public"} /> : null}
        <TitleFields title={draft.title} icon={draft.icon} summary={draft.summary} update={update} />
        <ArtifactOrganizers artifact={artifact} onUpdated={onUpdated} />
        <ModeBar mode={mode} onMode={changeMode} length={draft.content.length} updatedAt={artifact.updatedAt} updatedBy={artifact.updatedBy} className={stickyModeBar} />
        {/* Preview has no field to focus first, so the pane itself takes focus for Page Up/Down, Space, and the arrows. */}
        <div
          ref={bodyRef}
          data-slot="detail-body"
          role="region"
          aria-label="Content"
          tabIndex={mode === "preview" ? 0 : undefined}
          className={detailBody}
        >
          <ContentPane mode={mode} kind={draft.kind} content={draft.content} language={draft.language} title={draft.title} files={artifact.files} update={update} />
          {draft.kind === "file" || draft.kind === "ui" || artifact.files.length > 0 ? <AttachedFiles artifact={artifact} onUpdated={onUpdated} /> : null}
          <MetaFields draft={draft} update={update} />
        </div>
      </div>
      <ConfirmDialog
        state={confirmDelete.dialog}
        title="Delete this artifact?"
        description={`“${artifact.title}” will be removed for you and for every agent that reads it. This cannot be undone.`}
        confirmLabel="Delete"
        pending={pending === "delete"}
      />
    </section>
  );
}
