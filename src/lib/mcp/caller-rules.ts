import { canDeleteArtifact, canEditArtifact, canShareArtifact, type AccessViewer } from "@/lib/access-rules";
import type { ArtifactVisibility, CommentSetting } from "@/lib/artifact-types";
import { canSeeComments } from "@/lib/comments/setting-rules";
import { artifactHomeScope } from "@/lib/projects/rules";

/*
 * What the caller may do with one artifact, for its MCP result, from the
 * same rules the server enforces on every write (access-rules.ts and the
 * comments setting). Nothing here grants anything: each tool checks again.
 * Pure.
 */

/** What the caller may do: edit (and read the history), share, comment (read and write the thread), delete. */
export type CallerCan = "edit" | "share" | "comment" | "delete";

/** The artifact's fields these rules read. `userId` is the author. */
export interface CallerSubject {
  userId: string;
  visibility: ArtifactVisibility;
  teamId: string | null;
  comments: CommentSetting;
}

/** The caller, relative to that artifact. */
export interface CallerStanding {
  viewerId: string;
  /** Member of the artifact's own team, for a shared (not private) artifact. */
  isTeamMember: boolean;
  /** Whether the artifact's team is someone's personal team, when the caller belongs to it; null otherwise. */
  teamPersonal: boolean | null;
  /** The caller added the agent that wrote it and is still in the agent's team. */
  actsForAuthor: boolean;
  /** The edit decision the access check already made, when one was made (artifacts_get); otherwise the rule decides here. */
  canEdit?: boolean;
}

/** What the caller may do, and where the artifact lives for them. */
export interface CallerAccess {
  can: CallerCan[];
  canEdit: boolean;
  /** Its workspace, for those who may edit it (they see its project there too): its author's Personal one, or the team in `team`. Null otherwise. */
  home: "personal" | "team" | null;
}

/** Whether the caller belongs to the artifact's team, from the caller's own team ids: never for a private artifact (decideAccess in access.ts). */
export function isMemberOfTeam(subject: Pick<CallerSubject, "visibility" | "teamId">, callerTeamIds: ReadonlySet<string>): boolean {
  return subject.visibility !== "private" && subject.teamId !== null && callerTeamIds.has(subject.teamId);
}

/** The caller's rights on the artifact, decided by the server's own rules. */
export function callerAccess(subject: CallerSubject, standing: CallerStanding): CallerAccess {
  const viewer: AccessViewer = { userId: standing.viewerId, isTeamMember: standing.isTeamMember, actsForAuthor: standing.actsForAuthor };
  const canEdit = standing.canEdit ?? canEditArtifact({ ...subject, teamPersonal: standing.teamPersonal }, viewer);
  const rights: [CallerCan, boolean][] = [
    ["edit", canEdit],
    ["share", canShareArtifact(subject, viewer)],
    ["comment", canSeeComments(subject.comments, { canViewArtifact: true, isAuthor: subject.userId === standing.viewerId, isTeamMember: standing.isTeamMember })],
    ["delete", canDeleteArtifact(subject, viewer)],
  ];
  const home = canEdit ? (artifactHomeScope(subject, standing.teamPersonal).kind === "team" ? "team" : "personal") : null;
  return { can: rights.flatMap(([right, allowed]) => (allowed ? [right] : [])), canEdit, home };
}
