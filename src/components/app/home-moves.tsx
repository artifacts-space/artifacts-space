"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import type { ArtifactDto, ArtifactListItemDto, ShareableArtifactDto } from "@/lib/artifact-types";
import { elsewhereName, listedInWorkspace, movedMessage, moveHref, openLabel, returnedMessage, type HomeMove } from "@/lib/sharing/home-move-rules";

import { useShareActions } from "./share-actions";
import { undoApplies } from "./share-options";
import { useShareTeams, type ShareTeam } from "./share-teams-context";

/**
 * A workspace lists only the artifacts whose home it is
 * (src/lib/sharing/home-move-rules.ts). So a sharing change can move the
 * open artifact out of the list. This is what the workspace tells the
 * pieces under it: which workspace it is, and where a share control reports
 * a move, so the workspace can say where the artifact went.
 */
interface WorkspaceHome {
  /** The shared team whose workspace this is, or null for Personal. */
  scopeTeamId: string | null;
  viewerId: string;
  /** Called after a save that moved an artifact to another workspace, with its sharing before and the saved artifact. */
  moved: (before: ShareableArtifactDto, after: ArtifactDto, move: HomeMove) => void;
}

const WorkspaceHomeContext = createContext<WorkspaceHome | null>(null);

/** Provides the workspace to the list rows and share controls below it. */
export function WorkspaceHomeProvider({ home, children }: { home: WorkspaceHome; children: React.ReactNode }) {
  return <WorkspaceHomeContext value={home}>{children}</WorkspaceHomeContext>;
}

/** The workspace around a share control, or null on a page with no list (the artifact's own page). */
export function useWorkspaceHome(): WorkspaceHome | null {
  return use(WorkspaceHomeContext);
}

/**
 * The other workspace a list row names, or null for a row at home. Only an
 * artifact a link opened here can be from another workspace; its row says
 * which, so a list never seems to hold what it does not.
 */
export function useRowWorkspace(artifact: ArtifactListItemDto): string | null {
  const home = use(WorkspaceHomeContext);
  const teams = useShareTeams();
  if (!home) return null;
  const own = artifact.authorId === home.viewerId || artifact.actsForAuthor === true;
  return elsewhereName({ visibility: artifact.visibility, teamId: artifact.teamId, own }, teams, home.scopeTeamId);
}

const requestSent = "Request sent. An owner or admin will review it.";
const connectionError = "Something went wrong. Check your connection and try again.";

interface HomeMovesOptions {
  teams: readonly ShareTeam[];
  scopeTeam: ShareTeam | null;
  viewerId: string;
  /** The workspace's path: /app, or the fixture's page. */
  listPath: string;
  /** Puts an artifact an undone move brought back into the list again, and opens it. */
  onReturned: (artifact: ArtifactDto) => void;
}

/**
 * The workspace's side of a move. After a sharing change moved an artifact
 * to another workspace, a toast says where it went, with "Open in <name>"
 * (that workspace, with the artifact open) and Undo where putting the
 * sharing back applies at once. Undo saves the sharing it had through the
 * same action as the Share dialog, so the server decides again. `returned`
 * holds the artifacts Undo brought back, as the server answered them, until
 * a later save of theirs (`settle`): the pane's own copy is the moved one.
 */
export function useHomeMoves({ teams, scopeTeam, viewerId, listPath, onReturned }: HomeMovesOptions) {
  const router = useRouter();
  const actions = useShareActions();
  const scopeTeamId = scopeTeam?.id ?? null;
  const here = scopeTeam?.name ?? null;
  const [returned, setReturned] = useState<ReadonlyMap<string, ArtifactDto>>(() => new Map());

  const undo = useCallback(async (before: ShareableArtifactDto) => {
    try {
      const teamId = before.visibility === "private" ? null : before.teamId;
      const result = await actions.share(before.id, { visibility: before.visibility, teamId, comments: before.comments });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const { artifact } = result.data;
      if (!listedInWorkspace(artifact, teams, scopeTeamId)) {
        toast.success(requestSent);
        return;
      }
      setReturned((current) => new Map(current).set(artifact.id, artifact));
      onReturned(artifact);
      toast.success(returnedMessage(artifact.title, here));
    } catch {
      toast.error(connectionError);
    }
  }, [actions, teams, scopeTeamId, here, onReturned]);

  const moved = useCallback((before: ShareableArtifactDto, after: ArtifactDto, move: HomeMove) => {
    toast.success(movedMessage(after.title, move), {
      duration: 10_000,
      action: { label: openLabel(move), onClick: () => { router.push(moveHref(listPath, move, after.publicId)); } },
      ...(undoApplies(before, teams) ? { cancel: { label: "Undo", onClick: () => void undo(before) } } : {}),
    });
  }, [router, listPath, teams, undo]);

  const settle = useCallback((id: string) => {
    setReturned((current) => {
      if (!current.has(id)) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }, []);

  const home = useMemo<WorkspaceHome>(() => ({ scopeTeamId, viewerId, moved }), [scopeTeamId, viewerId, moved]);
  return { home, returned, settle };
}
