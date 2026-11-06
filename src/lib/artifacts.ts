import { randomUUID } from "node:crypto";

import { and, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { artifact, sharingRequest, type ArtifactRecord } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { viewableInTeamCondition } from "@/lib/access";
import { assertValidArtifactContent, assertValidArtifactUpdate } from "@/lib/artifact-content";
import {
  artifactKinds,
  type ArtifactDto,
  type ArtifactInput,
  type PendingEditDto,
  type PendingSharingDto,
} from "@/lib/artifact-types";
import { artifactSizeProblem } from "@/lib/artifact-limits";
import { generatePublicId } from "@/lib/public-id";
import type { SharingActor } from "@/lib/sharing/rules";
import { UserFacingError } from "@/lib/user-facing-error";
import { recordArtifactEdit } from "@/lib/versions/service";

/**
 * Artifact storage. Writes here are author-only. Visibility never changes
 * here: sharing goes through requestArtifactSharing in src/lib/sharing.
 */

const artifactUpdateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  summary: z.string().trim().max(600).optional(),
  content: z.string().min(1).max(1_000_000).optional(),
  kind: z.enum(artifactKinds).optional(),
  language: z.string().trim().max(60).optional(),
  project: z.string().trim().max(120).optional(),
  sessionId: z.string().trim().max(200).optional(),
  source: z.string().trim().max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Fields an update may change. Every field is optional. */
export type ArtifactUpdateInput = z.input<typeof artifactUpdateSchema>;

export const artifactInputSchema = artifactUpdateSchema
  .required({ title: true, content: true })
  .extend({
    summary: artifactUpdateSchema.shape.summary.default(""),
    kind: artifactUpdateSchema.shape.kind.default("markdown"),
    language: artifactUpdateSchema.shape.language.default(""),
    project: artifactUpdateSchema.shape.project.default(""),
    sessionId: artifactUpdateSchema.shape.sessionId.default(""),
    source: artifactUpdateSchema.shape.source.default(""),
    metadata: artifactUpdateSchema.shape.metadata.default({}),
  });

/** Throws a UserFacingError when content or metadata is over the per-artifact size cap. */
function assertArtifactSize(input: { content?: string | undefined; metadata?: Record<string, unknown> | undefined }) {
  const problem = artifactSizeProblem(input);
  if (problem) throw new UserFacingError(problem);
}

/** Maps a row to the workspace's DTO. */
export function toArtifactDto(record: ArtifactRecord, pendingSharing: PendingSharingDto | null = null, pendingEdit: PendingEditDto | null = null): ArtifactDto {
  return {
    id: record.id,
    publicId: record.publicId,
    title: record.title,
    summary: record.summary,
    content: record.content,
    kind: record.kind,
    language: record.language,
    project: record.project,
    sessionId: record.sessionId,
    source: record.source,
    visibility: record.visibility,
    teamId: record.teamId,
    authorId: record.userId,
    originalAuthorId: record.originalAuthorId,
    pendingSharing,
    pendingEdit,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** Open sharing and edit requests for these artifacts, each by artifact id. */
export async function pendingRequestsFor(artifactIds: string[]) {
  const sharing = new Map<string, PendingSharingDto>();
  const edits = new Map<string, PendingEditDto>();
  if (artifactIds.length === 0) return { sharing, edits };
  const rows = await getDb()
    .select()
    .from(sharingRequest)
    .where(and(inArray(sharingRequest.artifactId, artifactIds), eq(sharingRequest.status, "pending")));
  for (const row of rows) {
    const requestedAt = row.createdAt.toISOString();
    if (row.kind === "edit") edits.set(row.artifactId, { requestId: row.id, requestedAt });
    else sharing.set(row.artifactId, { requestId: row.id, level: row.visibility, teamId: row.teamId, requestedAt });
  }
  return { sharing, edits };
}

/** Maps rows to DTOs with their open sharing and edit requests. */
export async function toArtifactDtos(records: ArtifactRecord[]): Promise<ArtifactDto[]> {
  const pending = await pendingRequestsFor(records.map((record) => record.id));
  return records.map((record) => toArtifactDto(record, pending.sharing.get(record.id) ?? null, pending.edits.get(record.id) ?? null));
}

/** Which artifacts a list shows: the viewer's own, or those shared with one of their teams. */
export type ArtifactScope = { kind: "mine" } | { kind: "team"; teamId: string };

export interface ListOptions {
  scope?: ArtifactScope | undefined;
  query?: string | undefined;
  project?: string | undefined;
  limit?: number | undefined;
}

function searchCondition(query: string | undefined) {
  const text = query?.trim();
  if (!text) return undefined;
  const pattern = `%${text}%`;
  return or(ilike(artifact.title, pattern), ilike(artifact.summary, pattern), ilike(artifact.content, pattern), ilike(artifact.project, pattern));
}

function scopeCondition(viewerId: string, scope: ArtifactScope) {
  if (scope.kind === "mine") return eq(artifact.userId, viewerId);
  return viewableInTeamCondition(viewerId, scope.teamId);
}

/**
 * Lists artifacts the viewer may read in one scope, newest first. The team
 * scope checks membership in the query itself, so a non-member gets nothing.
 */
export async function listArtifacts(viewerId: string, options: ListOptions = {}): Promise<ArtifactDto[]> {
  const conditions: SQL[] = [scopeCondition(viewerId, options.scope ?? { kind: "mine" })];
  const search = searchCondition(options.query);
  if (search) conditions.push(search);
  if (options.project?.trim()) conditions.push(eq(artifact.project, options.project.trim()));

  const records = await getDb()
    .select()
    .from(artifact)
    .where(and(...conditions))
    .orderBy(desc(artifact.updatedAt))
    .limit(Math.min(Math.max(options.limit ?? 100, 1), 100));

  return toArtifactDtos(records);
}

/** The author's own artifact by internal id, or null. */
export async function getOwnArtifact(userId: string, id: string) {
  const [record] = await getDb()
    .select()
    .from(artifact)
    .where(and(eq(artifact.userId, userId), eq(artifact.id, id)))
    .limit(1);
  return record ?? null;
}

/** The author's own artifact by public id, or null. */
export async function getOwnArtifactByPublicId(userId: string, publicId: string) {
  const [record] = await getDb()
    .select()
    .from(artifact)
    .where(and(eq(artifact.userId, userId), eq(artifact.publicId, publicId)))
    .limit(1);
  return record ?? null;
}

/** The public id behind a legacy /share/<shareId> link, or null. */
export async function findPublicIdByShareId(shareId: string) {
  const [record] = await getDb().select({ publicId: artifact.publicId }).from(artifact).where(eq(artifact.shareId, shareId)).limit(1);
  return record?.publicId ?? null;
}

/** Creates a private artifact for its author, within the hourly creation limit. */
export async function createArtifact(userId: string, input: ArtifactInput) {
  const parsed = artifactInputSchema.parse(input);
  assertArtifactSize(parsed);
  assertValidArtifactContent(parsed.kind, parsed.content);
  await enforceRateLimit("artifactCreate", userId);
  const [record] = await getDb()
    .insert(artifact)
    .values({
      ...parsed,
      id: randomUUID(),
      shareId: randomUUID().replaceAll("-", ""),
      publicId: generatePublicId(),
      visibility: "private",
      userId,
    })
    .returning();

  if (!record) throw new Error("The artifact could not be created.");
  return toArtifactDto(record);
}

/**
 * Changes the author's own artifact. Returns null when it is not theirs.
 * Edits to link and public artifacts go through the approval rule: the DTO's
 * `pendingEdit` is set when readers outside the team still see the approved
 * version. `actor` is "agent" for MCP calls, which never approve.
 */
export async function updateArtifact(userId: string, id: string, input: ArtifactUpdateInput, actor: SharingActor = "person") {
  const parsed = artifactUpdateSchema.parse(input);
  assertArtifactSize(parsed);
  const before = await getOwnArtifact(userId, id);
  if (!before) return null;
  await assertValidArtifactUpdate(parsed, () => Promise.resolve(before));
  const [record] = await getDb()
    .update(artifact)
    .set({ ...parsed, updatedAt: new Date() })
    .where(and(eq(artifact.userId, userId), eq(artifact.id, id)))
    .returning();

  if (!record) return null;
  await recordArtifactEdit({ before, after: record, editorId: userId, actor });
  const [dto] = await toArtifactDtos([record]);
  return dto ?? null;
}

/** Deletes the author's own artifact. */
export async function deleteArtifact(userId: string, id: string) {
  const [record] = await getDb()
    .delete(artifact)
    .where(and(eq(artifact.userId, userId), eq(artifact.id, id)))
    .returning();

  return Boolean(record);
}
