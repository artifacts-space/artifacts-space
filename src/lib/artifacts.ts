import { randomUUID } from "node:crypto";

import { and, desc, eq, getTableColumns, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { artifact, sharingRequest, type ArtifactRecord } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { getEditableArtifact, viewableInTeamCondition } from "@/lib/access";
import { loadActors } from "@/lib/agents/queries";
import { assertValidArtifactContent, assertValidArtifactUpdate } from "@/lib/artifact-content";
import {
  artifactKinds,
  type ArtifactDto,
  type ArtifactEditorDto,
  type ArtifactInput,
  type ArtifactListItemDto,
  type PendingEditDto,
  type PendingSharingDto,
} from "@/lib/artifact-types";
import { artifactSizeProblem } from "@/lib/artifact-limits";
import { PREVIEW_CHARS, previewKinds } from "@/lib/artifact-preview";
import { checkContentFiles } from "@/lib/files/attach";
import { attachFileRows, deleteArtifactFiles, listFilesForArtifacts } from "@/lib/files/store";
import type { FileDto } from "@/lib/files/types";
import { generatePublicId } from "@/lib/public-id";
import { assertContentFits } from "@/lib/quota/usage";
import type { SharingActor } from "@/lib/sharing/rules";
import { UserFacingError } from "@/lib/user-facing-error";
import { getVersionOf } from "@/lib/versions/history";
import { recordArtifactSave } from "@/lib/versions/service";

/**
 * Artifact storage. The author and members of the team an artifact is shared
 * through edit it (getEditableArtifact); only the author deletes it. Every
 * save files a version. Visibility never changes here: sharing goes through
 * requestArtifactSharing in src/lib/sharing.
 */

const artifactUpdateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  summary: z.string().trim().max(600).optional(),
  // Empty only for file artifacts, whose content is optional notes; validateArtifactContent checks.
  content: z.string().max(1_000_000).optional(),
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

/** An artifact row without its content, as lists and access checks load it. */
export type ArtifactMetaRecord = Omit<ArtifactRecord, "content">;

const { content: contentColumn, ...metaColumns } = getTableColumns(artifact);

/** The content column alone, for queries that load content on purpose. */
export const artifactContentColumn = contentColumn;

/** Every artifact column except content, for queries that must not move content around. */
export function artifactMetaColumns() {
  return metaColumns;
}

/** Maps a row without content to the shared DTO fields. */
function toArtifactMeta(
  record: ArtifactMetaRecord,
  pendingSharing: PendingSharingDto | null,
  pendingEdit: PendingEditDto | null,
  files: FileDto[],
  updatedBy: ArtifactEditorDto | null,
): Omit<ArtifactDto, "content"> {
  return {
    id: record.id,
    publicId: record.publicId,
    title: record.title,
    summary: record.summary,
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
    files,
    updatedBy,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** Maps a row to the workspace's DTO. */
export function toArtifactDto(
  record: ArtifactRecord,
  pendingSharing: PendingSharingDto | null = null,
  pendingEdit: PendingEditDto | null = null,
  files: FileDto[] = [],
  updatedBy: ArtifactEditorDto | null = null,
): ArtifactDto {
  return { ...toArtifactMeta(record, pendingSharing, pendingEdit, files, updatedBy), content: record.content };
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

/** Who saved each artifact last, by user id. People and agents who are gone are left out. */
export async function lastEditorsFor(records: Pick<ArtifactRecord, "updatedBy">[]): Promise<Map<string, ArtifactEditorDto>> {
  const ids = records.flatMap((record) => (record.updatedBy ? [record.updatedBy] : []));
  const actors = await loadActors(ids);
  return new Map([...actors].map(([id, actor]) => [id, { id, kind: actor.kind, handle: actor.handle, name: actor.name }]));
}

/** Maps rows to DTOs with their open sharing and edit requests, files, and last editor. */
export async function toArtifactDtos(records: ArtifactRecord[]): Promise<ArtifactDto[]> {
  const ids = records.map((record) => record.id);
  const [pending, files, editors] = await Promise.all([pendingRequestsFor(ids), listFilesForArtifacts(ids), lastEditorsFor(records)]);
  return records.map((record) =>
    toArtifactDto(
      record,
      pending.sharing.get(record.id) ?? null,
      pending.edits.get(record.id) ?? null,
      files.get(record.id) ?? [],
      record.updatedBy ? editors.get(record.updatedBy) ?? null : null,
    ),
  );
}

/** Maps list rows (no content, with a preview) to list DTOs with their open requests and files. */
async function toArtifactListItems(rows: (ArtifactMetaRecord & { preview: string })[]): Promise<ArtifactListItemDto[]> {
  const ids = rows.map((row) => row.id);
  const [pending, files, editors] = await Promise.all([pendingRequestsFor(ids), listFilesForArtifacts(ids), lastEditorsFor(rows)]);
  return rows.map((row) => ({
    ...toArtifactMeta(
      row,
      pending.sharing.get(row.id) ?? null,
      pending.edits.get(row.id) ?? null,
      files.get(row.id) ?? [],
      row.updatedBy ? editors.get(row.updatedBy) ?? null : null,
    ),
    preview: row.preview,
  }));
}

/** The preview column: the first characters of readable formats, computed in Postgres so content never leaves it. */
const previewColumn = sql<string>`case when ${artifact.kind} in (${sql.join(previewKinds.map((kind) => sql`${kind}`), sql`, `)}) then left(${artifact.content}, ${PREVIEW_CHARS}) else '' end`;

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
 * Items carry a short preview, never content: load one artifact to read it.
 */
export async function listArtifacts(viewerId: string, options: ListOptions = {}): Promise<ArtifactListItemDto[]> {
  const conditions: SQL[] = [scopeCondition(viewerId, options.scope ?? { kind: "mine" })];
  const search = searchCondition(options.query);
  if (search) conditions.push(search);
  if (options.project?.trim()) conditions.push(eq(artifact.project, options.project.trim()));

  const rows = await getDb()
    .select({ ...artifactMetaColumns(), preview: previewColumn })
    .from(artifact)
    .where(and(...conditions))
    .orderBy(desc(artifact.updatedAt))
    .limit(Math.min(Math.max(options.limit ?? 100, 1), 100));

  return toArtifactListItems(rows);
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

/** Creates a private artifact for its author, within the hourly creation limit and the account's storage quota. */
export async function createArtifact(userId: string, input: ArtifactInput) {
  const parsed = artifactInputSchema.parse(input);
  assertArtifactSize(parsed);
  assertValidArtifactContent(parsed.kind, parsed.content);
  const fileIds = await checkContentFiles(userId, null, parsed.kind, parsed.content);
  await enforceRateLimit("artifactCreate", userId);
  await assertContentFits(userId, parsed.content);
  const [record] = await getDb()
    .insert(artifact)
    .values({
      ...parsed,
      id: randomUUID(),
      shareId: randomUUID().replaceAll("-", ""),
      publicId: generatePublicId(),
      visibility: "private",
      userId,
      updatedBy: userId,
    })
    .returning();

  if (!record) throw new Error("The artifact could not be created.");
  await attachFileRows(userId, record.id, fileIds);
  await recordArtifactSave({ before: null, after: record, editorId: userId, actor: "person", saveKind: "create" });
  const [dto] = await toArtifactDtos([record]);
  return dto ?? toArtifactDto(record);
}

/** Options for one save. */
export interface SaveOptions {
  /**
   * The artifact's `updatedAt` when the editor opened it (ISO). When someone
   * saved since, the save is refused instead of overwriting their work.
   */
  expectedUpdatedAt?: string | undefined;
}

/** The message when a save would overwrite someone else's newer save. */
export const STALE_SAVE_MESSAGE = "Someone saved a newer version while you were editing. Copy your changes, reload, and save again.";

function unchangedSince(expectedUpdatedAt: string | undefined) {
  if (!expectedUpdatedAt) return undefined;
  const expected = new Date(expectedUpdatedAt);
  if (Number.isNaN(expected.getTime())) throw new UserFacingError(STALE_SAVE_MESSAGE);
  // Postgres keeps microseconds; the browser saw milliseconds.
  return sql`date_trunc('milliseconds', ${artifact.updatedAt}) = ${expected.toISOString()}::timestamptz`;
}

interface SaveContext {
  editorId: string;
  before: ArtifactRecord;
  actor: SharingActor;
  options: SaveOptions;
  restoredFromId?: string | null;
}

/**
 * Writes checked changes, files the version, and returns the DTO. Saves are
 * limited per editor per hour (web and MCP together), because each one can
 * file a version.
 */
async function saveChanges(changes: z.output<typeof artifactUpdateSchema>, context: SaveContext) {
  const { editorId, before } = context;
  await enforceRateLimit("artifactUpdate", editorId);
  // Content counts toward the author's account, whoever edits it.
  if (changes.content !== undefined) await assertContentFits(before.userId, changes.content, before.content);
  await assertValidArtifactUpdate(changes, () => Promise.resolve(before));
  await attachUpdatedContentFiles(editorId, before, changes);
  const [record] = await getDb()
    .update(artifact)
    .set({ ...changes, updatedBy: editorId, updatedAt: new Date() })
    .where(and(eq(artifact.id, before.id), unchangedSince(context.options.expectedUpdatedAt)))
    .returning();

  if (!record) {
    if (context.options.expectedUpdatedAt) throw new UserFacingError(STALE_SAVE_MESSAGE);
    return null;
  }
  const saveKind = context.restoredFromId ? "restore" : "edit";
  await recordArtifactSave({ before, after: record, editorId, actor: context.actor, saveKind, restoredFromId: context.restoredFromId ?? null });
  const [dto] = await toArtifactDtos([record]);
  return dto ?? null;
}

/**
 * Changes an artifact the user may edit: their own, or one shared through a
 * team they belong to. Returns null when they may not. Every save files a
 * version. Edits to link and public artifacts go through the approval rule:
 * the DTO's `pendingEdit` is set when readers outside the team still see the
 * approved version. `actor` is "agent" for MCP calls, which never approve.
 */
export async function updateArtifact(userId: string, id: string, input: ArtifactUpdateInput, actor: SharingActor = "person", options: SaveOptions = {}) {
  const parsed = artifactUpdateSchema.parse(input);
  assertArtifactSize(parsed);
  const before = await getEditableArtifact(userId, { id });
  if (!before) return null;
  return saveChanges(parsed, { editorId: userId, before, actor, options });
}

/**
 * Brings back an older version as a new save. History is never rewritten:
 * the restore is filed as its own version, and for a link or public artifact
 * it waits for approval like any edit. Returns null when the user may not
 * edit the artifact; throws when the version is not the artifact's.
 */
export async function restoreArtifactVersion(userId: string, id: string, versionId: string, actor: SharingActor = "person", options: SaveOptions = {}) {
  const before = await getEditableArtifact(userId, { id });
  if (!before) return null;
  const version = await getVersionOf(before.id, versionId);
  if (!version) throw new UserFacingError("That version is no longer in the history.");
  const { title, summary, content, kind, language, project, source, metadata } = version;
  const changes = artifactUpdateSchema.parse({ title, summary, content, kind, language, project, source, metadata });
  assertArtifactSize(changes);
  return saveChanges(changes, { editorId: userId, before, actor, options, restoredFromId: version.id });
}

/**
 * Checks and attaches the files an update's content points at, before the
 * row changes, so a version saved with the edit already includes them.
 */
async function attachUpdatedContentFiles(userId: string, current: ArtifactRecord, update: { kind?: string | undefined; content?: string | undefined }) {
  if (update.kind === undefined && update.content === undefined) return;
  const fileIds = await checkContentFiles(userId, current.id, update.kind ?? current.kind, update.content ?? current.content);
  await attachFileRows(userId, current.id, fileIds);
}

/** Deletes the author's own artifact and its files. */
export async function deleteArtifact(userId: string, id: string) {
  const own = await getOwnArtifact(userId, id);
  if (!own) return false;
  await deleteArtifactFiles(own.id).catch((error: unknown) => {
    // The rows lose their artifact when it goes; the cleanup job removes them.
    console.error("[files] Files of a deleted artifact were left for cleanup", error instanceof Error ? error.name : "unknown error");
  });
  const [record] = await getDb()
    .delete(artifact)
    .where(and(eq(artifact.userId, userId), eq(artifact.id, id)))
    .returning();

  return Boolean(record);
}
