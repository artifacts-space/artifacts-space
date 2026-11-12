"use client";

import { IconLoader2, IconLock } from "@tabler/icons-react";
import { useRef } from "react";

import { ArtifactIcon } from "@/components/artifact-icon/artifact-icon";
import { VisibilityBadge } from "@/components/artifact-page/visibility-badge";
import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { ReaderBlockMenu } from "@/components/block-links/reader-block-menu";
import { CsvExportContext } from "@/components/artifact-view/csv-export";
import { ArtifactSheetFormat } from "@/components/artifact-view/sheet-format";
import { SheetKeyContext } from "@/components/artifact-view/use-sheet-prefs";
import { CommentsDialog } from "@/components/comments/comments-dialog";
import { CommentsControl } from "@/components/app/comments-picker";
import { CopyButton } from "@/components/copy-button";
import { HarnessByline } from "@/components/harness/harness-byline";
import { InlineCommentSurface } from "@/components/inline-comments/inline-comment-surface";
import { InlineCommentsProvider } from "@/components/inline-comments/inline-comments-provider";
import { LastEdited } from "@/components/history/last-edited";
import { VersionHistory } from "@/components/history/version-history";
import { Button } from "@/components/ui/button";
import { ViewsDialog } from "@/components/views/views-dialog";
import { OpenPageButton } from "@/components/page-width/open-page-button";
import type { ArtifactDto } from "@/lib/artifact-types";
import { mayExportCsv } from "@/lib/csv-export/rules";
import { previewColumnClass, usesFullWidth } from "@/lib/page-width/rules";
import { showsFormatChip } from "@/lib/artifact-kinds";
import { artifactPageHref } from "@/lib/artifact-page-href";
import { cn } from "@/lib/utils";
import { visibilityCopy, visibilitySentence } from "@/lib/visibility-copy";

import { ArtifactBreadcrumb } from "./artifact-editor/editor-toolbar";
import { PreviewSurface } from "./artifact-editor/preview-surface";
import { ShowSidebarButton } from "./sidebar-visibility";
import { KindChip } from "@/components/projects/artifact-organizers";
import { detailBody, detailOuter, detailSection, scrollbarRoom, useScrollbarRoom } from "./artifact-editor/detail-scroll";
import { useEditAccess, useWithdrawSharing } from "./use-edit-access";
import { useRenderTheme } from "./use-render-theme";

/** "Platform · Read only · Changes waiting for approval", leaving out what does not apply. The visibility badge comes first. */
function statusLine(artifact: ArtifactDto, teamName: string | null, canEdit: boolean) {
  const parts = [teamName, canEdit ? null : "Read only", artifact.pendingEdit ? "Changes waiting for approval" : null];
  return parts.filter(Boolean).join(" · ");
}

/** Who can see the artifact, as the same badge the artifact page shows, then the status line. */
function PanelStatus({ artifact, teamName, canEdit }: { artifact: ArtifactDto; teamName: string | null; canEdit: boolean }) {
  const status = statusLine(artifact, teamName, canEdit);
  return (
    <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      <VisibilityBadge
        visibility={artifact.visibility}
        sentence={visibilitySentence(visibilityCopy(artifact.visibility))}
        className="-ml-1.5 h-7 px-1.5 text-xs [&>svg]:size-3.5"
      />
      {status ? <span>· {status}</span> : null}
    </span>
  );
}

interface SharedArtifactPanelProps {
  artifact: ArtifactDto;
  viewerId: string;
  onUpdated: (artifact: ArtifactDto) => void;
  onWithdrawn: (id: string) => void;
}

/** Copy, unless the owner turned downloads off for this reader. */
function PanelCopy({ content, shown }: { content: string; shown: boolean }) {
  return shown ? <CopyButton value={content} variant="ghost" size="icon" /> : null;
}

/** The format (not for Markdown, showsFormatChip) and the tags; nothing at all, not an empty row, when neither shows. */
function PanelChips({ kind, tags }: { kind: ArtifactDto["kind"]; tags: readonly string[] }) {
  const format = showsFormatChip(kind);
  if (!format && tags.length === 0) return null;
  return (
    <div data-slot="panel-chips" className="mt-3 flex flex-wrap items-center gap-2">
      {format ? <KindChip kind={kind} /> : null}
      {tags.map((tag) => <span key={tag} className="inline-flex h-7 items-center rounded-lg border px-2 text-sm text-muted-foreground">{tag}</span>)}
    </div>
  );
}

/** The title (a link to its page), summary, format and tags, and the meta line, in the content's column. */
function PanelHeader({ artifact, column, status }: { artifact: ArtifactDto; column: string; status: React.ReactNode }) {
  const length = artifact.content.length;
  return (
    <div className={cn("pt-6 pb-1 sm:pt-10", scrollbarRoom)}>
      <div className={column}>
        <ArtifactIcon icon={artifact.icon} size="heading" className="mb-2 block" />
        <h2 className="text-3xl leading-tight font-semibold tracking-[-0.02em] sm:text-4xl">
          <a href={artifactPageHref(artifact.publicId)} target="_blank" rel="noopener noreferrer" className="hover:underline">{artifact.title}</a>
        </h2>
        {artifact.summary ? <p className="mt-2 text-md leading-6 text-muted-foreground">{artifact.summary}</p> : null}
        <PanelChips kind={artifact.kind} tags={artifact.tags} />
        <div data-slot="panel-meta" className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-b pb-3 text-xs text-muted-foreground">
          <LastEdited editor={artifact.updatedBy} at={artifact.updatedAt} />
          <HarnessByline harness={artifact.harness} className="text-xs" />
          <span aria-hidden>·</span>
          <span>{length.toLocaleString()} {length === 1 ? "char" : "chars"}</span>
          <span aria-hidden>·</span>
          {status}
        </div>
      </div>
    </div>
  );
}

/**
 * View of an artifact someone else shared with the viewer's team. Members
 * who may edit it see its history and can restore a version. Owners and
 * admins of that team can make it private again.
 */
export function SharedArtifactPanel({ artifact, viewerId, onUpdated, onWithdrawn }: SharedArtifactPanelProps) {
  const { team, canEdit, canWithdraw, seesComments } = useEditAccess(artifact, viewerId);
  const { withdrawing, withdraw } = useWithdrawSharing(artifact.id, onWithdrawn);
  const theme = useRenderTheme(artifact);
  // A CSV whose owner turned downloads off: no Copy, and the grid copies nothing, for a reader who cannot edit it.
  const exportable = mayExportCsv({ canEdit }, artifact);
  const column = previewColumnClass(usesFullWidth(artifact.kind, artifact.fullWidth));
  const outerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useScrollbarRoom(outerRef, bodyRef);

  return (
    // A Markdown artifact takes comments on its words: highlights in the text, threads in cards at them.
    <InlineCommentsProvider publicId={artifact.publicId} kind={artifact.kind} canComment={seesComments}>
    <section className={detailSection} aria-label={artifact.title}>
      <div className="flex min-h-14 flex-wrap items-center gap-2 border-b px-4 py-2 max-md:sticky max-md:top-14 max-md:z-10 max-md:bg-card sm:px-5">
        <ShowSidebarButton />
        <ArtifactBreadcrumb project={artifact.project} title={artifact.title} />
        <div className="ml-auto flex items-center gap-1">
          {seesComments ? <CommentsDialog publicId={artifact.publicId} title={artifact.title} seesComments offNotice="" /> : null}
          {canEdit ? (
            <>
              <VersionHistory
                publicId={artifact.publicId}
                title={artifact.title}
                updatedAt={artifact.updatedAt}
                reviewed={artifact.visibility === "link" || artifact.visibility === "public"}
                files={artifact.files}
                onRestored={onUpdated}
              />
              <ViewsDialog publicId={artifact.publicId} title={artifact.title} />
            </>
          ) : null}
          {canWithdraw ? <CommentsControl artifact={artifact} team={team} onUpdated={onUpdated} /> : null}
          {canWithdraw ? (
            <Button variant="outline" size="sm" disabled={withdrawing} onClick={() => void withdraw()}>
              {withdrawing ? <IconLoader2 className="animate-spin" /> : <IconLock />} Withdraw sharing
            </Button>
          ) : null}
          <PanelCopy content={artifact.content} shown={exportable} />
          <OpenPageButton publicId={artifact.publicId} />
        </div>
      </div>
      <div ref={outerRef} data-slot="detail-outer" className={detailOuter}>
        <PanelHeader artifact={artifact} column={column} status={<PanelStatus artifact={artifact} teamName={team?.name ?? null} canEdit={canEdit} />} />
        {/* Read only, so nothing in the pane takes focus first: the pane does, for keyboard scrolling. */}
        <div ref={bodyRef} data-slot="detail-body" role="region" aria-label="Content" tabIndex={0} className={detailBody}>
          <PreviewSurface theme={theme} fullWidth={usesFullWidth(artifact.kind, artifact.fullWidth)} className="py-6 sm:py-8">
            <SheetKeyContext value={artifact.publicId}>
              <CsvExportContext value={exportable}>
                <ArtifactSheetFormat artifactId={null} stored={artifact.sheetFormat}>
                  <ReaderBlockMenu publicId={artifact.publicId} enabled={artifact.kind === "markdown"}>
                    <InlineCommentSurface>
                      <ArtifactView kind={artifact.kind} content={artifact.content} title={artifact.title} language={artifact.language} files={artifact.files} />
                    </InlineCommentSurface>
                  </ReaderBlockMenu>
                </ArtifactSheetFormat>
              </CsvExportContext>
            </SheetKeyContext>
          </PreviewSurface>
        </div>
      </div>
    </section>
    </InlineCommentsProvider>
  );
}
