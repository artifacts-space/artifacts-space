import { randomUUID } from "node:crypto";

import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { artifact, type ArtifactRecord } from "@/db/schema";
import { assertValidArtifactContent, assertValidArtifactUpdate } from "@/lib/artifact-content";
import {
  artifactKinds,
  type ArtifactDto,
  type ArtifactInput,
} from "@/lib/artifact-types";

const artifactUpdateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  summary: z.string().trim().max(600).optional(),
  content: z.string().min(1).max(1_000_000).optional(),
  kind: z.enum(artifactKinds).optional(),
  language: z.string().trim().max(60).optional(),
  project: z.string().trim().max(120).optional(),
  sessionId: z.string().trim().max(200).optional(),
  source: z.string().trim().max(120).optional(),
  visibility: z.enum(["private", "unlisted"]).optional(),
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
    visibility: artifactUpdateSchema.shape.visibility.default("private"),
    metadata: artifactUpdateSchema.shape.metadata.default({}),
  });

export function toArtifactDto(record: ArtifactRecord): ArtifactDto {
  return {
    id: record.id,
    title: record.title,
    summary: record.summary,
    content: record.content,
    kind: record.kind,
    language: record.language,
    project: record.project,
    sessionId: record.sessionId,
    source: record.source,
    visibility: record.visibility,
    shareId: record.shareId,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function listArtifacts(
  userId: string,
  options: { query?: string | undefined; project?: string | undefined; limit?: number | undefined } = {},
) {
  const conditions: SQL[] = [eq(artifact.userId, userId)];
  const query = options.query?.trim();

  if (query) {
    const pattern = `%${query}%`;
    const search = or(
      ilike(artifact.title, pattern),
      ilike(artifact.summary, pattern),
      ilike(artifact.content, pattern),
      ilike(artifact.project, pattern),
    );
    if (search) conditions.push(search);
  }

  if (options.project?.trim()) {
    conditions.push(eq(artifact.project, options.project.trim()));
  }

  const records = await getDb()
    .select()
    .from(artifact)
    .where(and(...conditions))
    .orderBy(desc(artifact.updatedAt))
    .limit(Math.min(Math.max(options.limit ?? 100, 1), 100));

  return records.map(toArtifactDto);
}

export async function getArtifact(userId: string, id: string) {
  const [record] = await getDb()
    .select()
    .from(artifact)
    .where(and(eq(artifact.userId, userId), eq(artifact.id, id)))
    .limit(1);

  return record ? toArtifactDto(record) : null;
}

export async function getSharedArtifact(shareId: string) {
  const [record] = await getDb()
    .select()
    .from(artifact)
    .where(and(eq(artifact.shareId, shareId), eq(artifact.visibility, "unlisted")))
    .limit(1);

  return record ? toArtifactDto(record) : null;
}

export async function createArtifact(userId: string, input: ArtifactInput) {
  const parsed = artifactInputSchema.parse(input);
  assertValidArtifactContent(parsed.kind, parsed.content);
  const [record] = await getDb()
    .insert(artifact)
    .values({
      ...parsed,
      id: randomUUID(),
      shareId: randomUUID().replaceAll("-", ""),
      userId,
    })
    .returning();

  if (!record) throw new Error("The artifact could not be created.");
  return toArtifactDto(record);
}

export async function updateArtifact(
  userId: string,
  id: string,
  input: ArtifactUpdateInput,
) {
  const parsed = artifactUpdateSchema.parse(input);
  await assertValidArtifactUpdate(parsed, () => getArtifact(userId, id));
  const [record] = await getDb()
    .update(artifact)
    .set({ ...parsed, updatedAt: new Date() })
    .where(and(eq(artifact.userId, userId), eq(artifact.id, id)))
    .returning();

  return record ? toArtifactDto(record) : null;
}

export async function deleteArtifact(userId: string, id: string) {
  const [record] = await getDb()
    .delete(artifact)
    .where(and(eq(artifact.userId, userId), eq(artifact.id, id)))
    .returning();

  return Boolean(record);
}
