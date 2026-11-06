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

/** Only the author edits or deletes an artifact. */
export function canEditArtifact(subject: Pick<AccessSubject, "userId">, viewerId: string | null): boolean {
  return viewerId !== null && viewerId === subject.userId;
}

/** Search engines may index public artifacts only. */
export function isIndexable(visibility: ArtifactVisibility): boolean {
  return visibility === "public";
}
