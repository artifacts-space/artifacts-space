"use client";

import { IconExternalLink, IconLoader2, IconLock } from "@tabler/icons-react";
import Link from "next/link";
import { ArtifactIcon } from "@/components/artifact-icon/artifact-icon";
import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { CommentsDialog } from "@/components/comments/comments-dialog";
import { CommentsControl } from "@/components/app/comments-picker";
import { CopyButton } from "@/components/copy-button";
import { LastEdited } from "@/components/history/last-edited";
import { VersionHistory } from "@/components/history/version-history";
import { Button } from "@/components/ui/button";
import type { ArtifactDto } from "@/lib/artifact-types";

import { detailBody, detailOuter, detailSection } from "./artifact-editor/detail-scroll";
import { visibilityLabel } from "./share-options";
import { useEditAccess, useWithdrawSharing } from "./use-edit-access";

/** "Link · Platform · Read only · Changes waiting for approval", leaving out what does not apply. */
function statusLine(artifact: ArtifactDto, teamName: string | null, canEdit: boolean) {
  const parts = [visibilityLabel(artifact.visibility), teamName, canEdit ? null : "Read only", artifact.pendingEdit ? "Changes waiting for approval" : null];
  return parts.filter(Boolean).join(" · ");
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

  return (
    <section className={detailSection} aria-label={artifact.title}>
      <div className="flex min-h-12 flex-wrap items-center gap-2 border-b px-4 py-2 max-md:sticky max-md:top-14 max-md:z-10 max-md:bg-card sm:px-5">
        <span className="text-xs text-muted-foreground">
          {statusLine(artifact, team?.name ?? null, canEdit)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <CopyButton value={artifact.content} variant="ghost" size="icon" />
          {canEdit ? (
            <VersionHistory
              publicId={artifact.publicId}
              title={artifact.title}
              updatedAt={artifact.updatedAt}
              reviewed={artifact.visibility === "link" || artifact.visibility === "public"}
              files={artifact.files}
              onRestored={onUpdated}
            />
          ) : null}
          {seesComments ? <CommentsDialog publicId={artifact.publicId} title={artifact.title} seesComments offNotice="" /> : null}
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/artifact/${artifact.publicId}`} />}>
            <IconExternalLink /> Open page
          </Button>
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
          <h2 className="text-2xl font-medium tracking-[-0.015em]">{artifact.title}</h2>
          {artifact.summary ? <p className="mt-2 text-md leading-6 text-muted-foreground">{artifact.summary}</p> : null}
          <LastEdited editor={artifact.updatedBy} at={artifact.updatedAt} className="mt-2" />
        </div>
        {/* Read only, so nothing in the pane takes focus first: the pane does, for keyboard scrolling. */}
        <div data-slot="detail-body" role="region" aria-label="Content" tabIndex={0} className={detailBody}>
          <div className="min-h-[460px] flex-[1_0_auto] bg-card p-6 sm:p-8">
            <ArtifactView kind={artifact.kind} content={artifact.content} title={artifact.title} language={artifact.language} files={artifact.files} />
          </div>
        </div>
      </div>
    </section>
  );
}
