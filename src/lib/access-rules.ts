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
}

/**
 * The single read rule. Private: the author only. Team: the author and signed-in
 * members of the artifact's team. Link: anyone with the URL. Public: anyone.
 */
export function canViewArtifact(subject: AccessSubject, viewer: AccessViewer | null): boolean {
  if (subject.visibility === "public" || subject.visibility === "link") return true;
  if (!viewer) return false;
  if (viewer.userId === subject.userId) return true;
  return subject.visibility === "team" && subject.teamId !== null && viewer.isTeamMember;
}

/** The fields of an artifact that decide who can change it. */
export interface EditSubject extends AccessSubject {
  /** Whether `teamId` is someone's personal team. Null when the artifact names no team. */
  teamPersonal: boolean | null;
}

/**
 * The single edit rule, for people and agents alike. The author always edits.
 * Members of the artifact's team edit it once it is shared through that team
 * (team, link, or public), unless the team is someone's personal team.
 * Private artifacts stay with their author. Edits to link and public
 * artifacts still go through approval (src/lib/versions); this rule only
 * says who may save one. Whoever may edit may also read the history.
 */
export function canEditArtifact(subject: EditSubject, viewer: AccessViewer | null): boolean {
  if (!viewer) return false;
  if (viewer.userId === subject.userId) return true;
  if (subject.visibility === "private" || subject.teamId === null) return false;
  return subject.teamPersonal === false && viewer.isTeamMember;
}

/** Only the author deletes an artifact or changes who can read it. Team owners and admins can still withdraw sharing. */
export function canDeleteArtifact(subject: Pick<AccessSubject, "userId">, viewerId: string | null): boolean {
  return viewerId !== null && viewerId === subject.userId;
}

/** Search engines may index public artifacts only. */
export function isIndexable(visibility: ArtifactVisibility): boolean {
  return visibility === "public";
}
