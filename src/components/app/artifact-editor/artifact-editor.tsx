"use client";

import type { SaveArtifact } from "@/components/app/artifact-editor/use-autosave";
import { useState } from "react";

import { CommentsControl } from "@/components/app/comments-picker";
import { ShareControl } from "@/components/app/share-control";
import type { ShareTeam } from "@/components/app/share-teams-context";
import { useRenderTheme } from "@/components/app/use-render-theme";
import { useLeaveGuard } from "@/components/artifact-page/use-leave-guard";
import { ArtifactSheetFormat } from "@/components/artifact-view/sheet-format";
import { SheetKeyContext } from "@/components/artifact-view/use-sheet-prefs";
import { AttachedFiles } from "@/components/files/attached-files";
import { CommentsDialog } from "@/components/comments/comments-dialog";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { VersionHistory } from "@/components/history/version-history";
import { ViewsDialog } from "@/components/views/views-dialog";
import { ArtifactOrganizers } from "@/components/projects/artifact-organizers";
import { useArtifactHarness, type HarnessControl } from "@/components/harness/use-artifact-harness";
import type { ArtifactDto } from "@/lib/artifact-types";
import { usesFullWidth } from "@/lib/page-width/rules";
import { BlankPageFilesSlot } from "@/components/app/new-artifact/blank-page-parts";
import type { BlankPageOptions } from "@/components/app/new-artifact/use-blank-page";
import { useBlankEditor } from "@/components/app/new-artifact/use-blank-editor";

import { DetectedNotice } from "./detected-format-chip";
import { detailBody, detailOuter, detailSection, stickyModeBar, useScrollPlace } from "./detail-scroll";
import { ShareBanner, TitleFields } from "./editor-sections";
import { BlankToolbar, EditorToolbar, type SourceToggle } from "./editor-toolbar";
import { FormatDialog } from "./format-dialog";
import { hasInlineField, InlineContent } from "./inline-content";
import { ConflictNotice, SaveStatusBar } from "./save-status";
import { useArtifactActions } from "./use-artifact-actions";
import { useArtifactDraft } from "./use-artifact-draft";
import { useAutosave } from "./use-autosave";
import { useFullWidth, type FullWidthControl } from "./use-full-width";

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
  /** Set for the blank page New artifact opens: nothing is stored until something is put in it (use-blank-page.ts). */
  blankPage?: BlankPageOptions | undefined;
  /** Changes each time New artifact is pressed, to bring the blank page back into view with the cursor in its title. */
  focusRequest?: number;
  /** How a stored artifact saves: the server action unless the workspace hands its own (the /dev/workspace fixture's store). */
  save?: SaveArtifact | undefined;
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

interface ArtifactToolbarProps {
  artifact: ArtifactDto;
  kind: ArtifactDto["kind"];
  shareUrl: string;
  shared: boolean;
  access: Pick<ArtifactEditorProps, "canShare" | "canDelete" | "team" | "seesComments" | "onWithdraw">;
  dirty: boolean;
  source: SourceToggle;
  onRequestDelete: () => void;
  onRestored: (artifact: ArtifactDto) => void;
  onUpdated: (artifact: ArtifactDto) => void;
  fullWidth: FullWidthControl;
  harness: HarnessControl;
  onChangeFormat: () => void;
  notice: React.ReactNode;
}

/** The toolbar of a stored artifact: copy, open, history, views, comments, share, and the More menu. */
function ArtifactToolbar({ artifact, kind, shareUrl, shared, access, dirty, source, onRequestDelete, onRestored, onUpdated, fullWidth, harness, onChangeFormat, notice }: ArtifactToolbarProps) {
  const { canShare, canDelete, team, seesComments, onWithdraw } = access;
  return (
    <EditorToolbar
      id={artifact.id}
      publicId={artifact.publicId}
      kind={kind}
      content={artifact.content}
      shareControl={<SharingSlot artifact={artifact} shareUrl={shareUrl} canShare={canShare} manager={onWithdraw !== null} team={team} onUpdated={onUpdated} />}
      history={<VersionHistory publicId={artifact.publicId} title={artifact.title} updatedAt={artifact.updatedAt} reviewed={shared} files={artifact.files} hasUnsavedChanges={dirty} onRestored={onRestored} />}
      comments={
        <CommentsDialog
          publicId={artifact.publicId}
          title={artifact.title}
          seesComments={seesComments}
          offNotice={`Comments are off for this artifact.${canShare ? " Change who can comment in Share." : ""}`}
        />
      }
      views={<ViewsDialog publicId={artifact.publicId} title={artifact.title} />}
      source={source}
      onRequestDelete={canDelete ? onRequestDelete : null}
      onWithdraw={onWithdraw}
      fullWidth={fullWidth}
      harness={harness}
      onChangeFormat={onChangeFormat}
      notice={notice}
    />
  );
}

/**
 * Edit one artifact in place and read its history. The artifact renders as
 * itself and is editable where it reads; changes save on their own a moment
 * after typing stops (use-autosave.ts), and View source in the More menu
 * shows the raw content. The author (or the person who added the agent that
 * wrote it) also shares and deletes it.
 */
export function ArtifactEditor({ artifact, origin, canShare, canDelete, team, seesComments, onWithdraw, onUpdated, onDeleted, blankPage, focusRequest, save }: ArtifactEditorProps) {
  const { draft, update, replace, reset, remount, revision } = useArtifactDraft(artifact);
  const [sourceOpen, setSourceOpen] = useState(false);
  const { outerRef, bodyRef, remember } = useScrollPlace(sourceOpen ? "source" : "page");
  const { page, sectionRef, titleRef, dragging, focusBody, filesApi, saveWith } = useBlankEditor({ blankPage, artifact, draft, replace, onUpdated, body: bodyRef, sourceOpen, focusRequest, save });
  const autosave = useAutosave({ artifact, draft, replaceDraft: replace, onUpdated, save: saveWith, problem: page.problem, idle: page.idle });
  const [formatOpen, setFormatOpen] = useState(false);
  const { deleting, remove } = useArtifactActions({ artifact, onDeleted });
  const fullWidth = useFullWidth(artifact, onUpdated);
  const harness = useArtifactHarness(artifact, onUpdated);
  const confirmDelete = useConfirm("deleteArtifact");
  const shareUrl = `${origin}/artifact/${artifact.publicId}`;
  const shared = artifact.visibility === "link" || artifact.visibility === "public";
  const { dismissDetected } = page;
  const notice = <DetectedNotice detected={page.detected} onChange={() => { setFormatOpen(true); }} onDismiss={dismissDetected} />;
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
    <section ref={sectionRef} className={detailSection} aria-label={page.label}>
      {page.blank ? <BlankToolbar kind={draft.kind} notice={notice} onChangeFormat={() => { setFormatOpen(true); }} /> : (
        <ArtifactToolbar
          artifact={artifact}
          kind={draft.kind}
          shareUrl={shareUrl}
          shared={shared}
          access={{ canShare, canDelete, team, seesComments, onWithdraw }}
          dirty={autosave.dirty}
          source={{ open: sourceOpen, onToggle: toggleSource }}
          onRequestDelete={() => { if (!deleting) confirmDelete.request(remove); }}
          onRestored={(restored) => { reset(restored); onUpdated(restored); }}
          onUpdated={onUpdated}
          fullWidth={fullWidth}
          harness={harness}
          onChangeFormat={() => { setFormatOpen(true); }}
          notice={notice}
        />
      )}
      <div ref={outerRef} data-slot="detail-outer" className={detailOuter}>
        {shared ? <ShareBanner shareUrl={shareUrl} isPublic={artifact.visibility === "public"} /> : null}
        <TitleFields title={draft.title} icon={draft.icon} summary={draft.summary} update={update} titleRef={titleRef} onEnter={focusBody} />
        <ArtifactOrganizers artifact={artifact} onUpdated={onUpdated} hidden={page.blank} />
        <SaveStatusBar
          status={autosave.status}
          dirty={autosave.dirty}
          length={draft.content.length}
          updatedAt={artifact.updatedAt}
          updatedBy={artifact.updatedBy}
          harness={artifact.harness}
          stored={!page.blank}
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
          <SheetKeyContext value={artifact.publicId}>
            <ArtifactSheetFormat artifactId={draft.kind === "csv" ? artifact.id : null} stored={artifact.sheetFormat}>
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
            </ArtifactSheetFormat>
          </SheetKeyContext>
          <BlankPageFilesSlot page={page} dragging={dragging} />
          {!page.blank && showsFiles(draft.kind, artifact.files.length) ? <AttachedFiles artifact={artifact} onUpdated={onUpdated} api={filesApi} /> : null}
        </div>
      </div>
      <FormatDialog
        open={formatOpen}
        onOpenChange={setFormatOpen}
        kind={draft.kind}
        language={draft.language}
        content={draft.content}
        storedContent={artifact.content}
        onApply={(kind, language, content) => {
          dismissDetected();
          // A new format draws the content with another editor, so it remounts.
          replace({ ...draft, kind, language, content }, kind !== draft.kind || content !== draft.content);
        }}
      />
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
