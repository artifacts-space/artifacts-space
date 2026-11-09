"use client";

import { useState } from "react";

import { CommentsControl } from "@/components/app/comments-picker";
import { ShareControl } from "@/components/app/share-control";
import type { ShareTeam } from "@/components/app/share-teams-context";
import { useRenderTheme } from "@/components/app/use-render-theme";
import { useLeaveGuard } from "@/components/artifact-page/use-leave-guard";
import { AttachedFiles } from "@/components/files/attached-files";
import { CommentsDialog } from "@/components/comments/comments-dialog";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { VersionHistory } from "@/components/history/version-history";
import { ViewsDialog } from "@/components/views/views-dialog";
import { ArtifactOrganizers } from "@/components/projects/artifact-organizers";
import { useArtifactHarness } from "@/components/harness/use-artifact-harness";
import type { ArtifactDto } from "@/lib/artifact-types";
import { usesFullWidth } from "@/lib/page-width/rules";

import { detailBody, detailOuter, detailSection, stickyModeBar, useScrollPlace } from "./detail-scroll";
import { MetaFields, ShareBanner, TitleFields } from "./editor-sections";
import { EditorToolbar } from "./editor-toolbar";
import { hasInlineField, InlineContent } from "./inline-content";
import { ConflictNotice, SaveStatusBar } from "./save-status";
import { useArtifactActions } from "./use-artifact-actions";
import { useArtifactDraft } from "./use-artifact-draft";
import { useAutosave } from "./use-autosave";
import { useFullWidth } from "./use-full-width";

interface ArtifactEditorProps {
  artifact: ArtifactDto;
  origin: string;
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

/** Files show under formats that use them, and under any artifact that has some. */
function showsFiles(kind: ArtifactDto["kind"], fileCount: number) {
  return kind === "file" || kind === "ui" || fileCount > 0;
}

/**
 * Edit one artifact in place and read its history. The artifact renders as
 * itself and is editable where it reads; changes save on their own a moment
 * after typing stops (use-autosave.ts), and View source in the More menu
 * shows the raw content. The author (or the person who added the agent that
 * wrote it) also shares and deletes it.
 */
export function ArtifactEditor({ artifact, origin, canShare, canDelete, team, seesComments, onWithdraw, onUpdated, onDeleted }: ArtifactEditorProps) {
  const { draft, update, replace, reset, remount, revision } = useArtifactDraft(artifact);
  const autosave = useAutosave({ artifact, draft, replaceDraft: replace, onUpdated });
  const { deleting, remove } = useArtifactActions({ artifact, onDeleted });
  const [sourceOpen, setSourceOpen] = useState(false);
  const fullWidth = useFullWidth(artifact, onUpdated);
  const harness = useArtifactHarness(artifact, onUpdated);
  const confirmDelete = useConfirm("deleteArtifact");
  const shareUrl = `${origin}/artifact/${artifact.publicId}`;
  const shared = artifact.visibility === "link" || artifact.visibility === "public";
  const { outerRef, bodyRef, remember } = useScrollPlace(sourceOpen ? "source" : "page");
  const theme = useRenderTheme(artifact);
  const saving = autosave.status.kind === "saving";
  useLeaveGuard(autosave.dirty || saving);

  const toggleSource = () => {
    remember();
    // Back from the source, editors that keep their own state reload what was typed there.
    if (sourceOpen) remount();
    setSourceOpen(!sourceOpen);
  };

  return (
    <section className={detailSection} aria-label={`Edit ${artifact.title}`}>
      <EditorToolbar
        id={artifact.id}
        publicId={artifact.publicId}
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
            hasUnsavedChanges={autosave.dirty}
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
        views={<ViewsDialog publicId={artifact.publicId} title={artifact.title} />}
        source={{ open: sourceOpen, onToggle: toggleSource }}
        onRequestDelete={canDelete ? () => { if (!deleting) confirmDelete.request(remove); } : null}
        onWithdraw={onWithdraw}
        fullWidth={fullWidth}
        harness={harness}
      />
      <div ref={outerRef} data-slot="detail-outer" className={detailOuter}>
        {shared ? <ShareBanner shareUrl={shareUrl} isPublic={artifact.visibility === "public"} /> : null}
        <TitleFields title={draft.title} icon={draft.icon} summary={draft.summary} update={update} />
        <ArtifactOrganizers artifact={artifact} onUpdated={onUpdated} />
        <SaveStatusBar
          status={autosave.status}
          dirty={autosave.dirty}
          length={draft.content.length}
          updatedAt={artifact.updatedAt}
          updatedBy={artifact.updatedBy}
          harness={artifact.harness}
          onRetry={autosave.retryNow}
          className={stickyModeBar}
        />
        <ConflictNotice status={autosave.status} onLoadTheirs={autosave.loadTheirs} onKeepMine={autosave.keepMine} />
        {/* A rendered view has no field to focus first, so the pane itself takes focus for Page Up/Down, Space, and the arrows. */}
        <div
          ref={bodyRef}
          data-slot="detail-body"
          role="region"
          aria-label="Content"
          tabIndex={hasInlineField(draft.kind, sourceOpen) ? undefined : 0}
          className={detailBody}
        >
          <InlineContent
            kind={draft.kind}
            content={draft.content}
            language={draft.language}
            title={draft.title}
            files={artifact.files}
            revision={revision}
            sourceOpen={sourceOpen}
            fullWidth={usesFullWidth(draft.kind, artifact.fullWidth)}
            theme={theme}
            onChange={(content) => { update("content", content); }}
            onShowSource={() => { if (!sourceOpen) toggleSource(); }}
          />
          {showsFiles(draft.kind, artifact.files.length) ? <AttachedFiles artifact={artifact} onUpdated={onUpdated} /> : null}
          <MetaFields draft={draft} update={update} />
        </div>
      </div>
      <ConfirmDialog
        state={confirmDelete.dialog}
        title="Delete this artifact?"
        description={`“${artifact.title}” will be removed for you and for every agent that reads it. This cannot be undone.`}
        confirmLabel="Delete"
        pending={deleting}
      />
    </section>
  );
}
