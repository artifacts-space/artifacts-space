"use client";

import { IconLoader2, IconLock } from "@tabler/icons-react";

import { ArtifactIcon } from "@/components/artifact-icon/artifact-icon";
import { VisibilityBadge } from "@/components/artifact-page/visibility-badge";
import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { SheetKeyContext } from "@/components/artifact-view/use-sheet-prefs";
import { CommentsDialog } from "@/components/comments/comments-dialog";
import { CommentsControl } from "@/components/app/comments-picker";
import { CopyButton } from "@/components/copy-button";
import { LastEdited } from "@/components/history/last-edited";
import { VersionHistory } from "@/components/history/version-history";
import { Button } from "@/components/ui/button";
import { ViewsDialog } from "@/components/views/views-dialog";
import { OpenPageButton } from "@/components/page-width/open-page-button";
import type { ArtifactDto } from "@/lib/artifact-types";
import { usesFullWidth } from "@/lib/page-width/rules";
import { artifactPageHref } from "@/lib/artifact-page-href";
import { visibilityCopy, visibilitySentence } from "@/lib/visibility-copy";

import { PreviewSurface } from "./artifact-editor/preview-surface";
import { detailBody, detailOuter, detailSection } from "./artifact-editor/detail-scroll";
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

/**
 * View of an artifact someone else shared with the viewer's team. Members
 * who may edit it see its history and can restore a version. Owners and
 * admins of that team can make it private again.
 */
export function SharedArtifactPanel({ artifact, viewerId, onUpdated, onWithdrawn }: SharedArtifactPanelProps) {
  const { team, canEdit, canWithdraw, seesComments } = useEditAccess(artifact, viewerId);
  const { withdrawing, withdraw } = useWithdrawSharing(artifact.id, onWithdrawn);
  const theme = useRenderTheme(artifact);

  return (
    <section className={detailSection} aria-label={artifact.title}>
      <div className="flex min-h-12 flex-wrap items-center gap-2 border-b px-4 py-2 max-md:sticky max-md:top-14 max-md:z-10 max-md:bg-card sm:px-5">
        <PanelStatus artifact={artifact} teamName={team?.name ?? null} canEdit={canEdit} />
        <div className="ml-auto flex items-center gap-1">
          <CopyButton value={artifact.content} variant="ghost" size="icon" />
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
          {seesComments ? <CommentsDialog publicId={artifact.publicId} title={artifact.title} seesComments offNotice="" /> : null}
          <OpenPageButton publicId={artifact.publicId} />
          {canWithdraw ? <CommentsControl artifact={artifact} team={team} onUpdated={onUpdated} /> : null}
          {canWithdraw ? (
            <Button variant="outline" size="sm" disabled={withdrawing} onClick={() => void withdraw()}>
              {withdrawing ? <IconLoader2 className="animate-spin" /> : <IconLock />} Withdraw sharing
            </Button>
          ) : null}
        </div>
      </div>
      <div data-slot="detail-outer" className={detailOuter}>
        <div className="border-b px-5 py-5 sm:px-7">
          <ArtifactIcon icon={artifact.icon} size="heading" className="mb-2 block" />
          <h2 className="text-2xl font-medium tracking-[-0.015em]">
            <a href={artifactPageHref(artifact.publicId)} target="_blank" rel="noopener noreferrer" className="hover:underline">{artifact.title}</a>
          </h2>
          {artifact.summary ? <p className="mt-2 text-md leading-6 text-muted-foreground">{artifact.summary}</p> : null}
          <LastEdited editor={artifact.updatedBy} at={artifact.updatedAt} className="mt-2" />
        </div>
        {/* Read only, so nothing in the pane takes focus first: the pane does, for keyboard scrolling. */}
        <div data-slot="detail-body" role="region" aria-label="Content" tabIndex={0} className={detailBody}>
          <PreviewSurface theme={theme} fullWidth={usesFullWidth(artifact.kind, artifact.fullWidth)} className="py-6 sm:py-8">
            <SheetKeyContext value={artifact.publicId}>
              <ArtifactView kind={artifact.kind} content={artifact.content} title={artifact.title} language={artifact.language} files={artifact.files} />
            </SheetKeyContext>
          </PreviewSurface>
        </div>
      </div>
    </section>
  );
}
