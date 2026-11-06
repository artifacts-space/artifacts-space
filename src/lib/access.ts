import { and, eq, exists, ne } from "drizzle-orm";
import { cache } from "react";

import { getDb } from "@/db";
import { artifact, artifactVersion, sharingRequest, teamMember, type ArtifactRecord } from "@/db/schema";
import { canEditArtifact, canViewArtifact } from "@/lib/access-rules";
import type { ArtifactKind } from "@/lib/artifact-types";
import { isPublicId } from "@/lib/public-id";
import { isReviewedLevel, versionToServe } from "@/lib/versions/rules";

/**
 * The one access check for reading artifacts. Every read path (the public
 * page, the workspace, MCP tools, and APIs) goes through getViewableArtifact
 * for one artifact, or listArtifacts (which uses viewableInTeamCondition) for
 * lists. The rule itself lives in access-rules.ts.
 */

/** True when the user is a member of the team. */
export async function isTeamMember(userId: string, teamId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: teamMember.id })
    .from(teamMember)
    .where(and(eq(teamMember.userId, userId), eq(teamMember.teamId, teamId)))
    .limit(1);
  return Boolean(row);
}

/**
 * SQL for "shared with this team and readable by this viewer": the artifact
 * names the team, is not private, and the viewer is a member of the team.
 */
export function viewableInTeamCondition(viewerId: string, teamId: string) {
  const membership = getDb()
    .select({ id: teamMember.id })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, viewerId)));
  const condition = and(eq(artifact.teamId, teamId), ne(artifact.visibility, "private"), exists(membership));
  if (!condition) throw new Error("The team scope could not be built.");
  return condition;
}

/** What a viewer reads: the latest version, or the approved one of a link or public artifact. */
export interface ServedArtifactView {
  title: string;
  summary: string;
  content: string;
  kind: ArtifactKind;
  language: string;
  project: string;
  source: string;
  metadata: Record<string, unknown>;
  /** When this version was saved. */
  updatedAt: Date;
}

/** An artifact the viewer may read, with what else they may do. */
export interface ViewableArtifact {
  /** The stored row. Its content is the latest version; show `view` instead. */
  record: ArtifactRecord;
  /** What this viewer may read. Never show `record`'s content in its place. */
  view: ServedArtifactView;
  /** Which version `view` is. Readers outside the team get the approved version. */
  version: { source: "latest" | "approved"; versionId: string | null };
  /** Whether newer changes wait for approval. Null when the viewer is not told (outside the team). */
  editPending: boolean | null;
  canEdit: boolean;
  /** Whether the viewer belongs to the artifact's team. Pages show the team's name only then. */
  isTeamMember: boolean;
}

async function viewerIsMember(viewerId: string | null, teamId: string | null) {
  if (!viewerId || !teamId) return false;
  return isTeamMember(viewerId, teamId);
}

function latestView(record: ArtifactRecord): ServedArtifactView {
  const { title, summary, content, kind, language, project, source, metadata, updatedAt } = record;
  return { title, summary, content, kind, language, project, source, metadata, updatedAt };
}

async function hasPendingEdit(artifactId: string) {
  const [row] = await getDb()
    .select({ id: sharingRequest.id })
    .from(sharingRequest)
    .where(and(eq(sharingRequest.artifactId, artifactId), eq(sharingRequest.kind, "edit"), eq(sharingRequest.status, "pending")))
    .limit(1);
  return Boolean(row);
}

async function approvedView(versionId: string): Promise<ServedArtifactView | null> {
  const [row] = await getDb().select().from(artifactVersion).where(eq(artifactVersion.id, versionId)).limit(1);
  if (!row) return null;
  const { title, summary, content, kind, language, project, source, metadata, createdAt } = row;
  return { title, summary, content, kind, language, project, source, metadata, updatedAt: createdAt };
}

/**
 * Loads an artifact by public id for a viewer (null when signed out). Returns
 * null when it does not exist or the viewer may not read it, so callers show
 * the same "not found" either way. Readers outside the artifact's team get
 * its approved version. Deduplicated per request.
 */
export const getViewableArtifact = cache(async (publicId: string, viewerId: string | null): Promise<ViewableArtifact | null> => {
  if (!isPublicId(publicId)) return null;
  const [record] = await getDb().select().from(artifact).where(eq(artifact.publicId, publicId)).limit(1);
  if (!record) return null;
  const member = record.visibility === "private" ? false : await viewerIsMember(viewerId, record.teamId);
  if (!canViewArtifact(record, viewerId ? { userId: viewerId, isTeamMember: member } : null)) return null;
  const isAuthor = viewerId === record.userId;
  const served = versionToServe({ visibility: record.visibility, approvedVersionId: record.approvedVersionId, isAuthor, isTeamMember: member });
  const base = { record, canEdit: canEditArtifact(record, viewerId), isTeamMember: member };
  if (served.source === "approved") {
    const view = await approvedView(served.versionId);
    if (view) return { ...base, view, version: { source: "approved", versionId: served.versionId }, editPending: null };
  }
  const editPending = isReviewedLevel(record.visibility) ? await hasPendingEdit(record.id) : false;
  return { ...base, view: latestView(record), version: { source: "latest", versionId: null }, editPending };
});

/**
 * A quick read check by public id that loads no content, for src/proxy.ts.
 * `viewerId` is resolved only when the artifact is private or team, so link
 * and public pages cost one indexed query.
 */
export async function canReadArtifact(publicId: string, resolveViewer: () => Promise<string | null>): Promise<boolean> {
  if (!isPublicId(publicId)) return false;
  const [subject] = await getDb()
    .select({ userId: artifact.userId, visibility: artifact.visibility, teamId: artifact.teamId })
    .from(artifact)
    .where(eq(artifact.publicId, publicId))
    .limit(1);
  if (!subject) return false;
  if (canViewArtifact(subject, null)) return true;
  const viewerId = await resolveViewer();
  if (!viewerId) return false;
  const member = subject.visibility === "team" ? await viewerIsMember(viewerId, subject.teamId) : false;
  return canViewArtifact(subject, { userId: viewerId, isTeamMember: member });
}
