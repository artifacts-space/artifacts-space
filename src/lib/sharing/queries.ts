import { and, desc, eq, ne } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, sharingRequest, user } from "@/db/schema";
import type { ArtifactVisibility, SharingLevel } from "@/lib/artifact-types";

/** An open request as the team page lists it. */
export interface PendingSharingView {
  requestId: string;
  artifactId: string;
  publicId: string;
  title: string;
  level: SharingLevel;
  currentVisibility: ArtifactVisibility;
  requesterName: string;
  requesterUsername: string | null;
  requestedAt: string;
}

/** Open sharing requests for a team. Callers must check the viewer is an owner or admin. */
export async function listPendingSharing(teamId: string): Promise<PendingSharingView[]> {
  const rows = await getDb()
    .select({
      requestId: sharingRequest.id,
      artifactId: artifact.id,
      publicId: artifact.publicId,
      title: artifact.title,
      level: sharingRequest.visibility,
      currentVisibility: artifact.visibility,
      requesterName: user.name,
      requesterUsername: user.username,
      requestedAt: sharingRequest.createdAt,
    })
    .from(sharingRequest)
    .innerJoin(artifact, eq(artifact.id, sharingRequest.artifactId))
    .innerJoin(user, eq(user.id, sharingRequest.requestedBy))
    .where(and(eq(sharingRequest.teamId, teamId), eq(sharingRequest.status, "pending")))
    .orderBy(desc(sharingRequest.createdAt));
  return rows.map((row) => ({ ...row, requestedAt: row.requestedAt.toISOString() }));
}

/** An artifact shared through a team, as the team page lists it. */
export interface TeamSharedView {
  artifactId: string;
  publicId: string;
  title: string;
  visibility: ArtifactVisibility;
  authorName: string;
  authorUsername: string | null;
  updatedAt: string;
}

/** Artifacts shared with or approved by a team, newest first. Callers must check membership. */
export async function listTeamSharedArtifacts(teamId: string, limit = 100): Promise<TeamSharedView[]> {
  const rows = await getDb()
    .select({
      artifactId: artifact.id,
      publicId: artifact.publicId,
      title: artifact.title,
      visibility: artifact.visibility,
      authorName: user.name,
      authorUsername: user.username,
      updatedAt: artifact.updatedAt,
    })
    .from(artifact)
    .innerJoin(user, eq(user.id, artifact.userId))
    .where(and(eq(artifact.teamId, teamId), ne(artifact.visibility, "private")))
    .orderBy(desc(artifact.updatedAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}
