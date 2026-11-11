import type { ArtifactVisibility } from "@/lib/artifact-types";

/** The fields of an artifact that decide who can read it. */
export interface AccessSubject {
  userId: string;
  visibility: ArtifactVisibility;
  teamId: string | null;
}

/** Who is asking. `isTeamMember` is about the artifact's own team. Null means signed out. */
export interface AccessViewer {
  userId: string;
  isTeamMember: boolean;
  /**
   * The author is an agent this viewer added, and the viewer is still in the
   * agent's team (src/lib/agents/owner-access.ts). Left out means no.
   */
  actsForAuthor?: boolean;
}

/**
 * Whether the viewer stands in the author's place: the author, or the person
 * who added the agent that wrote it. Used for reading, listing, editing,
 * sharing, and deleting.
 */
export function isAuthorOrActsFor(subject: Pick<AccessSubject, "userId">, viewer: AccessViewer | null): boolean {
  if (!viewer) return false;
  return viewer.userId === subject.userId || viewer.actsForAuthor === true;
}

/**
 * The single read rule. Private: the author only (and the person who added
 * the agent that wrote it). Team: the author and signed-in members of the
 * artifact's team. Link: anyone with the URL. Public: anyone.
 */
export function canViewArtifact(subject: AccessSubject, viewer: AccessViewer | null): boolean {
  if (subject.visibility === "public" || subject.visibility === "link") return true;
  if (!viewer) return false;
  if (isAuthorOrActsFor(subject, viewer)) return true;
  return subject.visibility === "team" && subject.teamId !== null && viewer.isTeamMember;
}

/** The fields of an artifact that decide who can change it. */
export interface EditSubject extends AccessSubject {
  /** Whether `teamId` is someone's personal team. Null when the artifact names no team. */
  teamPersonal: boolean | null;
}

/**
 * The single edit rule, for people and agents alike. The author (or the
 * person who added the agent that wrote it) always edits.
 * Members of the artifact's team edit it once it is shared through that team
 * (team, link, or public), unless the team is someone's personal team.
 * Private artifacts stay with their author. Edits to link and public
 * artifacts still go through approval (src/lib/versions); this rule only
 * says who may save one. Whoever may edit may also read the history.
 */
export function canEditArtifact(subject: EditSubject, viewer: AccessViewer | null): boolean {
  if (!viewer) return false;
  if (isAuthorOrActsFor(subject, viewer)) return true;
  if (subject.visibility === "private" || subject.teamId === null) return false;
  return subject.teamPersonal === false && viewer.isTeamMember;
}

/**
 * Who changes who can read an artifact, and so who gets Share in the
 * workspace and on the artifact's page: the author, or the person who added
 * the agent that wrote it. Teammates who may edit it, team owners and admins
 * among them, never share it; owners and admins can only withdraw sharing.
 * The sharing service checks the same rule again on every change.
 */
export function canShareArtifact(subject: Pick<AccessSubject, "userId">, viewer: AccessViewer | null): boolean {
  return isAuthorOrActsFor(subject, viewer);
}

/**
 * People stay in charge of their own work and their agents' work: the author,
 * or the person who added the agent that wrote it, deletes an artifact and
 * changes who can read it (isAuthorOrActsFor). Team owners and admins can
 * withdraw sharing but never delete a teammate's artifact.
 */
export function canDeleteArtifact(subject: Pick<AccessSubject, "userId">, viewer: AccessViewer | null): boolean {
  return isAuthorOrActsFor(subject, viewer);
}

/**
 * Public pages of accounts younger than this are not indexed, so nobody signs
 * up just to host spam or phishing that search engines list under
 * artifacts.space. The pages still work by link. An agent's work counts
 * from its owner's account.
 */
export const NEW_ACCOUNT_NOINDEX_DAYS = 3;

const dayMs = 86_400_000;

/**
 * Search engines may index public artifacts only, and only once the author's
 * account (the owner's, for an agent) is NEW_ACCOUNT_NOINDEX_DAYS old.
 * Unknown account age is treated as new.
 */
export function isIndexable(visibility: ArtifactVisibility, accountCreatedAt: Date | null, now: Date = new Date()): boolean {
  if (visibility !== "public" || !accountCreatedAt) return false;
  return now.getTime() - accountCreatedAt.getTime() >= NEW_ACCOUNT_NOINDEX_DAYS * dayMs;
}
