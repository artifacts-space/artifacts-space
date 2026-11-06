"use client";

import { IconExternalLink, IconLoader2, IconLock } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { withdrawSharingAction } from "@/app/(workspace)/app/sharing-actions";
import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { CommentThread } from "@/components/comments/comment-thread";
import { CopyButton } from "@/components/copy-button";
import { LastEdited } from "@/components/history/last-edited";
import { VersionHistory } from "@/components/history/version-history";
import { Button } from "@/components/ui/button";
import { canEditArtifact } from "@/lib/access-rules";
import type { ArtifactDto } from "@/lib/artifact-types";
import { canManageTeam } from "@/lib/teams/roles";

import { visibilityLabel } from "./share-options";
import { useShareTeams } from "./share-teams-context";

/** "Link · Platform · Read only · Changes waiting for approval", leaving out what does not apply. */
function statusLine(artifact: ArtifactDto, teamName: string | null, canEdit: boolean) {
  const parts = [visibilityLabel(artifact.visibility), teamName, canEdit ? null : "Read only", artifact.pendingEdit ? "Changes waiting for approval" : null];
  return parts.filter(Boolean).join(" · ");
}

/** The viewer's team for this artifact, and whether they may edit it or withdraw its sharing. */
function useSharedAccess(artifact: ArtifactDto, viewerId: string) {
  const team = useShareTeams().find((item) => item.id === artifact.teamId);
  const canEdit = canEditArtifact(
    { userId: artifact.authorId, visibility: artifact.visibility, teamId: artifact.teamId, teamPersonal: team?.personal ?? null },
    { userId: viewerId, isTeamMember: team !== undefined },
  );
  return { team, canEdit, canWithdraw: team ? canManageTeam(team.role) : false };
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
  const { team, canEdit, canWithdraw } = useSharedAccess(artifact, viewerId);
  const [withdrawing, setWithdrawing] = useState(false);

  async function withdraw() {
    setWithdrawing(true);
    try {
      const result = await withdrawSharingAction(artifact.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Sharing withdrawn. Only the author can read it now.");
      onWithdrawn(artifact.id);
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col" aria-label={artifact.title}>
      <div className="flex min-h-12 flex-wrap items-center gap-2 border-b px-4 py-2 sm:px-5">
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
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/artifact/${artifact.publicId}`} />}>
            <IconExternalLink /> Open page
          </Button>
          {canWithdraw ? (
            <Button variant="outline" size="sm" disabled={withdrawing} onClick={() => void withdraw()}>
              {withdrawing ? <IconLoader2 className="animate-spin" /> : <IconLock />} Withdraw sharing
            </Button>
          ) : null}
        </div>
      </div>
      <div className="border-b px-5 py-5 sm:px-7">
        <h2 className="text-2xl font-medium tracking-[-0.015em]">{artifact.title}</h2>
        {artifact.summary ? <p className="mt-2 text-md leading-6 text-muted-foreground">{artifact.summary}</p> : null}
        <LastEdited editor={artifact.updatedBy} at={artifact.updatedAt} className="mt-2" />
      </div>
      <div className="min-h-[460px] flex-1 bg-card p-6 sm:p-8">
        <ArtifactView kind={artifact.kind} content={artifact.content} title={artifact.title} language={artifact.language} files={artifact.files} />
      </div>
      <CommentThread publicId={artifact.publicId} className="border-t px-5 py-5 sm:px-7" />
    </section>
  );
}
