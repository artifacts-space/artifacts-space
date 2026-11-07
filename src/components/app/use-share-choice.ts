"use client";

import { useState } from "react";

import type { ArtifactDto, ArtifactVisibility, CommentSetting } from "@/lib/artifact-types";

import { previewComments } from "./comment-options";
import { defaultTeamId } from "./share-options";
import type { ShareTeam } from "./share-teams-context";

/**
 * The Share dialog's choice: who can read it, through which team, and who can
 * comment. Until the person picks a comments setting, it follows the level and
 * team the way the server would decide it.
 */
export function useShareChoice(artifact: ArtifactDto, teams: readonly ShareTeam[]) {
  const [visibility, setVisibility] = useState<ArtifactVisibility>(artifact.visibility);
  const [teamId, setTeamId] = useState(() => defaultTeamId(artifact.visibility, teams, artifact.teamId));
  const [comments, setComments] = useState<CommentSetting>(artifact.comments);
  const [commentsChosen, setCommentsChosen] = useState(false);

  function follow(nextVisibility: ArtifactVisibility, nextTeamId: string | null) {
    if (commentsChosen) return;
    const nextTeam = teams.find((item) => item.id === nextTeamId);
    setComments(previewComments({ current: artifact.comments, currentTeamId: artifact.teamId, visibility: nextVisibility, team: nextTeam }));
  }

  return {
    visibility,
    teamId,
    team: teams.find((item) => item.id === teamId),
    comments,
    changeLevel: (next: ArtifactVisibility) => {
      const nextTeamId = defaultTeamId(next, teams, teamId ?? artifact.teamId);
      setVisibility(next);
      setTeamId(nextTeamId);
      follow(next, nextTeamId);
    },
    changeTeam: (next: string) => {
      setTeamId(next);
      follow(visibility, next);
    },
    chooseComments: (next: CommentSetting) => {
      setComments(next);
      setCommentsChosen(true);
    },
  };
}
