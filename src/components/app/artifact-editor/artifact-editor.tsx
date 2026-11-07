"use client";

import { useState } from "react";

import { CommentsControl } from "@/components/app/comments-picker";
import { ShareControl } from "@/components/app/share-control";
import type { ShareTeam } from "@/components/app/share-teams-context";
import { AttachedFiles } from "@/components/files/attached-files";
import { CommentThread } from "@/components/comments/comment-thread";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { VersionHistory } from "@/components/history/version-history";
import type { ArtifactDto } from "@/lib/artifact-types";

import { ContentPane } from "./content-pane";
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
  isAuthor: boolean;
  manager: boolean;
  team: ShareTeam | undefined;
  onUpdated: (artifact: ArtifactDto) => void;
}

/** The author's Share button, or the comments setting for a team owner or admin. Nothing for other teammates. */
function SharingSlot({ artifact, shareUrl, isAuthor, manager, team, onUpdated }: SharingSlotProps) {
  if (isAuthor) return <ShareControl artifact={artifact} shareUrl={shareUrl} onUpdated={onUpdated} />;
  if (manager) return <CommentsControl artifact={artifact} team={team} onUpdated={onUpdated} />;
  return null;
}

/** The thread, or a note that comments are off. Editors are the author or team members, so only "off" hides it. */
function CommentsSection({ publicId, seesComments, isAuthor }: { publicId: string; seesComments: boolean; isAuthor: boolean }) {
  if (seesComments) return <CommentThread publicId={publicId} className="border-t px-5 py-5 sm:px-7" />;
  return (
    <p className="border-t px-5 py-4 text-sm text-muted-foreground sm:px-7">
      Comments are off for this artifact.{isAuthor ? " Change who can comment in Share." : null}
    </p>
  );
}

/** Edit one artifact and read its history. The author also shares and deletes it. */
export function ArtifactEditor({ artifact, origin, isAuthor, team, seesComments, onWithdraw, onUpdated, onDeleted }: ArtifactEditorProps) {
  const { draft, update, dirty, reset } = useArtifactDraft(artifact);
  const { pending, save, remove } = useArtifactActions({ artifact, draft, onUpdated, onDeleted });
  const [mode, setMode] = useState<EditorMode>("preview");
  const confirmDelete = useConfirm("deleteArtifact");
  const shareUrl = `${origin}/artifact/${artifact.publicId}`;
  const shared = artifact.visibility === "link" || artifact.visibility === "public";

  return (
    <section className="flex min-w-0 flex-1 flex-col" aria-label={`Edit ${artifact.title}`}>
      <EditorToolbar
        id={artifact.id}
        kind={draft.kind}
        content={artifact.content}
        shareControl={<SharingSlot artifact={artifact} shareUrl={shareUrl} isAuthor={isAuthor} manager={onWithdraw !== null} team={team} onUpdated={onUpdated} />}
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
        dirty={dirty}
        pending={pending}
        onSave={() => void save()}
        onRequestDelete={isAuthor ? () => { if (pending !== "delete") confirmDelete.request(remove); } : null}
        onWithdraw={onWithdraw}
      />
      {shared ? <ShareBanner shareUrl={shareUrl} isPublic={artifact.visibility === "public"} /> : null}
      <TitleFields title={draft.title} summary={draft.summary} update={update} />
      <ModeBar mode={mode} onMode={setMode} length={draft.content.length} updatedAt={artifact.updatedAt} updatedBy={artifact.updatedBy} />
      <ContentPane mode={mode} kind={draft.kind} content={draft.content} language={draft.language} title={draft.title} files={artifact.files} update={update} />
      {draft.kind === "file" || draft.kind === "ui" || artifact.files.length > 0 ? <AttachedFiles artifact={artifact} onUpdated={onUpdated} /> : null}
      <MetaFields draft={draft} update={update} />
      <CommentsSection publicId={artifact.publicId} seesComments={seesComments} isAuthor={isAuthor} />
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
