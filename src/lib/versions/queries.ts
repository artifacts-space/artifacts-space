import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import { agent, artifact, artifactVersion, sharingRequest, user } from "@/db/schema";
import type { ArtifactVisibility } from "@/lib/artifact-types";

import type { ReviewedFields } from "./rules";

/** An edit waiting for approval, with what readers see now and what they would see. */
export interface PendingEditView {
  requestId: string;
  artifactId: string;
  publicId: string;
  visibility: ArtifactVisibility;
  /** Seeds the requester's pixel avatar. */
  requesterId: string;
  requesterKind: "person" | "agent";
  requesterName: string;
  requesterUsername: string | null;
  requestedAt: string;
  /** The approved version readers outside the team see now. Null for older artifacts without one. */
  before: ReviewedFields | null;
  /** The version waiting for approval. */
  after: ReviewedFields;
}

const approved = alias(artifactVersion, "approved_version");
const proposed = alias(artifactVersion, "proposed_version");

function fields(row: typeof artifactVersion.$inferSelect): ReviewedFields {
  // No project: it is not versioned and never reviewed (src/lib/projects).
  const { title, icon, theme, cover, summary, content, kind, language, source, metadata } = row;
  return { title, icon, theme, cover, summary, content, kind, language, source, metadata };
}

/** Open edit requests for a team, newest first. Callers must check the viewer may approve edits (`can(member, "approve.edits")`). */
export async function listPendingEdits(teamId: string, limit = 25): Promise<PendingEditView[]> {
  const rows = await getDb()
    .select({ request: sharingRequest, artifact, requester: { id: user.id, name: user.name, username: user.username }, requesterAgentId: agent.userId, approved, proposed })
    .from(sharingRequest)
    .innerJoin(artifact, eq(artifact.id, sharingRequest.artifactId))
    .innerJoin(user, eq(user.id, sharingRequest.requestedBy))
    .leftJoin(agent, eq(agent.userId, user.id))
    .innerJoin(proposed, eq(proposed.id, sharingRequest.versionId))
    .leftJoin(approved, eq(approved.id, artifact.approvedVersionId))
    .where(and(eq(sharingRequest.teamId, teamId), eq(sharingRequest.kind, "edit"), eq(sharingRequest.status, "pending")))
    .orderBy(desc(sharingRequest.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    requestId: row.request.id,
    artifactId: row.artifact.id,
    publicId: row.artifact.publicId,
    visibility: row.artifact.visibility,
    requesterId: row.requester.id,
    requesterKind: row.requesterAgentId ? "agent" : "person",
    requesterName: row.requester.name,
    requesterUsername: row.requester.username,
    requestedAt: row.request.createdAt.toISOString(),
    before: row.approved ? fields(row.approved) : null,
    after: fields(row.proposed),
  }));
}
