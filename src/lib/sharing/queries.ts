import { and, desc, eq, inArray, max, ne } from "drizzle-orm";

import { getDb } from "@/db";
import { agent, artifact, sharingRequest, user } from "@/db/schema";
import type { ArtifactVisibility, CommentSetting, SharingLevel } from "@/lib/artifact-types";

/** An open request as the team page lists it. */
export interface PendingSharingView {
  requestId: string;
  /** sharing: who can read it (with who may comment). comments: open its comments to anyone signed in. */
  kind: "sharing" | "comments";
  /** Who may comment once approved. */
  comments: CommentSetting | null;
  artifactId: string;
  publicId: string;
  title: string;
  icon: string | null;
  level: SharingLevel;
  currentVisibility: ArtifactVisibility;
  /** Seeds the requester's pixel avatar. */
  requesterId: string;
  requesterKind: "person" | "agent";
  requesterName: string;
  requesterUsername: string | null;
  requestedAt: string;
}

/** Open sharing and comments requests for a team. Callers must check the viewer is an owner or admin. */
export async function listPendingSharing(teamId: string): Promise<PendingSharingView[]> {
  const rows = await getDb()
    .select({
      requestId: sharingRequest.id,
      kind: sharingRequest.kind,
      comments: sharingRequest.comments,
      artifactId: artifact.id,
      publicId: artifact.publicId,
      title: artifact.title,
      icon: artifact.icon,
      level: sharingRequest.visibility,
      currentVisibility: artifact.visibility,
      requesterId: user.id,
      requesterAgentId: agent.userId,
      requesterName: user.name,
      requesterUsername: user.username,
      requestedAt: sharingRequest.createdAt,
    })
    .from(sharingRequest)
    .innerJoin(artifact, eq(artifact.id, sharingRequest.artifactId))
    .innerJoin(user, eq(user.id, sharingRequest.requestedBy))
    .leftJoin(agent, eq(agent.userId, user.id))
    .where(and(eq(sharingRequest.teamId, teamId), inArray(sharingRequest.kind, ["sharing", "comments"]), eq(sharingRequest.status, "pending")))
    .orderBy(desc(sharingRequest.createdAt));
  return rows.map(({ requesterAgentId, kind, ...row }) => ({
    ...row,
    kind: kind === "comments" ? "comments" : "sharing",
    requesterKind: requesterAgentId ? "agent" : "person",
    requestedAt: row.requestedAt.toISOString(),
  }));
}

/** An artifact shared through a team, as the team page lists it. */
export interface TeamSharedView {
  artifactId: string;
  publicId: string;
  title: string;
  icon: string | null;
  visibility: ArtifactVisibility;
  /** Seeds the author's pixel avatar. */
  authorId: string;
  authorKind: "person" | "agent";
  authorName: string;
  authorUsername: string | null;
  updatedAt: string;
  /** When its latest approved sharing in this team was decided. Null when it was shared without approval, which leaves no record. */
  sharedAt: string | null;
}

type Db = Pick<ReturnType<typeof getDb>, "select">;

/**
 * The query behind listTeamSharedArtifacts. The approval dates come from a
 * grouped subquery filtered by the team id and joined on the artifact id, never
 * a correlated subquery (see the tripwire in AGENTS.md). Exported for its
 * `.toSQL()` test.
 */
export function teamSharedQuery(db: Db, teamId: string, limit: number) {
  const approvals = db
    .select({ artifactId: sharingRequest.artifactId, sharedAt: max(sharingRequest.decidedAt).as("shared_at") })
    .from(sharingRequest)
    .where(and(eq(sharingRequest.teamId, teamId), eq(sharingRequest.kind, "sharing"), eq(sharingRequest.status, "approved")))
    .groupBy(sharingRequest.artifactId)
    .as("approvals");
  return db
    .select({
      artifactId: artifact.id,
      publicId: artifact.publicId,
      title: artifact.title,
      icon: artifact.icon,
      visibility: artifact.visibility,
      authorId: user.id,
      authorAgentId: agent.userId,
      authorName: user.name,
      authorUsername: user.username,
      updatedAt: artifact.updatedAt,
      sharedAt: approvals.sharedAt,
    })
    .from(artifact)
    .innerJoin(user, eq(user.id, artifact.userId))
    .leftJoin(agent, eq(agent.userId, user.id))
    .leftJoin(approvals, eq(approvals.artifactId, artifact.id))
    .where(and(eq(artifact.teamId, teamId), ne(artifact.visibility, "private")))
    .orderBy(desc(artifact.updatedAt))
    .limit(limit);
}

/** Artifacts shared with or approved by a team, newest first. Callers must check membership. */
export async function listTeamSharedArtifacts(teamId: string, limit = 100): Promise<TeamSharedView[]> {
  const rows = await teamSharedQuery(getDb(), teamId, limit);
  return rows.map(({ authorAgentId, ...row }) => ({
    ...row,
    authorKind: authorAgentId ? "agent" : "person",
    updatedAt: row.updatedAt.toISOString(),
    sharedAt: row.sharedAt ? row.sharedAt.toISOString() : null,
  }));
}
