import { useState } from "react";
import { toast } from "sonner";

import { withdrawSharingAction } from "@/app/(workspace)/app/sharing-actions";
import { canEditArtifact } from "@/lib/access-rules";
import type { ArtifactDto } from "@/lib/artifact-types";
import { canSeeComments } from "@/lib/comments/setting-rules";
import { canManageTeam } from "@/lib/teams/roles";

import { useShareTeams } from "./share-teams-context";

type AccessFields = Pick<ArtifactDto, "authorId" | "actsForAuthor" | "visibility" | "teamId" | "comments">;

/**
 * What the viewer may do with an artifact in the workspace, from the same
 * rule the server enforces (canEditArtifact): edit it (the author, or a
 * member of the team it is shared through), share it (the author, or the
 * person who added the agent that wrote it), withdraw its sharing and change
 * its comments setting (the team's owners and admins), and see its comments
 * (the comments setting). The server checks every action again.
 */
export function useEditAccess(artifact: AccessFields | null, viewerId: string) {
  const teams = useShareTeams();
  if (!artifact) return { team: undefined, isAuthor: false, canShare: false, canEdit: false, canWithdraw: false, seesComments: false };
  const team = teams.find((item) => item.id === artifact.teamId);
  const isAuthor = artifact.authorId === viewerId;
  const actsForAuthor = artifact.actsForAuthor === true;
  const canEdit = canEditArtifact(
    { userId: artifact.authorId, visibility: artifact.visibility, teamId: artifact.teamId, teamPersonal: team?.personal ?? null },
    { userId: viewerId, isTeamMember: team !== undefined, actsForAuthor },
  );
  const seesComments = canSeeComments(artifact.comments, { canViewArtifact: true, isAuthor, isTeamMember: team !== undefined });
  const canShare = isAuthor || actsForAuthor;
  return { team, isAuthor, canShare, canEdit, canWithdraw: !canShare && team !== undefined && canManageTeam(team.role), seesComments };
}

/** Makes a teammate's artifact private again, for the team's owners and admins. */
export function useWithdrawSharing(artifactId: string, onWithdrawn: (id: string) => void) {
  const [withdrawing, setWithdrawing] = useState(false);

  async function withdraw() {
    setWithdrawing(true);
    try {
      const result = await withdrawSharingAction(artifactId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Sharing withdrawn. Only the author can read it now.");
      onWithdrawn(artifactId);
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setWithdrawing(false);
    }
  }

  return { withdrawing, withdraw };
}
