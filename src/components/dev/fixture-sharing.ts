import type { ShareActions } from "@/components/app/share-actions";
import type { ShareTeam } from "@/components/app/share-teams-context";
import { commentSettings, type ArtifactDto } from "@/lib/artifact-types";
import { decideSharing } from "@/lib/sharing/rules";

/**
 * Development only: sharing for the /dev/workspace fixture, kept in memory,
 * with a stand-in for the sharing server actions. Each change is decided by
 * the real sharing rule (decideSharing) for the fixture's teams: it applies
 * at once or waits as a request. Nothing reaches a server. The fixture
 * lists its artifacts by the same home rule as /app, so a share with a team
 * here moves the artifact out of Personal and into the team's workspace.
 */

/** What sharing changed about an artifact, by artifact id. */
export type FixtureSharing = Readonly<Record<string, Pick<ArtifactDto, "visibility" | "teamId" | "comments" | "showInSearch" | "pendingSharing">>>;

const requestedAt = "2026-11-16T12:00:00.000Z";

/** The artifacts with the sharing changes made in this tab. */
export function withSharing(artifacts: readonly ArtifactDto[], state: FixtureSharing): ArtifactDto[] {
  return artifacts.map((artifact) => {
    const changed = state[artifact.id];
    return changed ? { ...artifact, ...changed } : artifact;
  });
}

/**
 * The fixture has no teammates. On a team's workspace its private artifacts
 * stand in for the team's: each reads as shared with that team, so the
 * workspace has a full list. An artifact this tab made private again
 * (withSharing, applied after this) is the viewer's own and leaves.
 */
export function asTeamArtifacts(artifacts: readonly ArtifactDto[], scopeTeam: ShareTeam | null): ArtifactDto[] {
  if (!scopeTeam) return [...artifacts];
  return artifacts.map((artifact) => (artifact.visibility === "private" ? { ...artifact, visibility: "team", teamId: scopeTeam.id } : artifact));
}

function fail(error: string) {
  return Promise.resolve({ success: false as const, error });
}

/** A tiny store for the fixture's sharing, so the stand-in actions can read and write outside render. */
export function createFixtureShareStore(teams: readonly ShareTeam[]) {
  let state: FixtureSharing = {};
  let shown: readonly ArtifactDto[] = [];
  const listeners = new Set<() => void>();
  const find = (id: string) => shown.find((artifact) => artifact.id === id);
  const keep = (artifact: ArtifactDto) => {
    const { visibility, teamId, comments, showInSearch, pendingSharing } = artifact;
    state = { ...state, [artifact.id]: { visibility, teamId, comments, showInSearch, pendingSharing } };
    for (const listener of listeners) listener();
    return artifact;
  };
  const actions: ShareActions = {
    share: (id, input) => {
      const current = find(id);
      if (!current) return fail("Artifact not found. Only its author, or the person who added the agent that wrote it, can share it.");
      const team = teams.find((item) => item.id === input.teamId);
      const comments = input.comments ?? current.comments;
      if (input.visibility === "private" || !team) {
        return Promise.resolve({ success: true, data: { status: "applied", comments: "applied", artifact: keep({ ...current, visibility: "private", teamId: null, comments, showInSearch: false, pendingSharing: null }) } });
      }
      if (decideSharing({ level: input.visibility, team, member: team, actor: "person" }) === "pending") {
        const pendingSharing = { requestId: `fixture-request-${id}`, level: input.visibility, teamId: team.id, comments, requestedAt };
        return Promise.resolve({ success: true, data: { status: "pending", comments: "pending", artifact: keep({ ...current, pendingSharing }) } });
      }
      return Promise.resolve({ success: true, data: { status: "applied", comments: "applied", artifact: keep({ ...current, visibility: input.visibility, teamId: team.id, comments, pendingSharing: null }) } });
    },
    comments: (id, comments) => {
      const current = find(id);
      if (!current) return fail("Artifact not found.");
      const setting = commentSettings.find((item) => item === comments) ?? current.comments;
      return Promise.resolve({ success: true, data: { status: "applied", artifact: keep({ ...current, comments: setting }) } });
    },
    search: (id, on) => {
      const current = find(id);
      return current ? Promise.resolve({ success: true, data: keep({ ...current, showInSearch: on }) }) : fail("Artifact not found.");
    },
  };
  return {
    read: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    /** The artifacts as the page shows them now, which the actions answer with. */
    show: (artifacts: readonly ArtifactDto[]) => { shown = artifacts; },
    actions,
  };
}
