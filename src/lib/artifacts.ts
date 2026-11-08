import { randomUUID } from "node:crypto";

import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { artifact, sharingRequest, type ArtifactRecord } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { getEditableArtifact, viewableInTeamCondition } from "@/lib/access";
import { authoredByViewerCondition, findDeletableArtifact, ownedAgentIds } from "@/lib/agents/owner-access";
import { loadActors } from "@/lib/agents/queries";
import { assertValidArtifactContent, assertValidArtifactUpdate } from "@/lib/artifact-content";
import {
  artifactKinds,
  type ArtifactDto,
  type ArtifactEditorDto,
  type ArtifactInput,
  type ArtifactListItemDto,
  type ArtifactProjectDto,
  type PendingCommentsDto,
  type PendingEditDto,
  type PendingSharingDto,
} from "@/lib/artifact-types";
import { artifactMetaColumns, type ArtifactMetaRecord } from "@/lib/artifact-columns";
import { artifactIconInputSchema, iconFileId } from "@/lib/artifact-icons";
import { artifactThemeInputSchema } from "@/lib/themes/artifact-theme";
import { assertTeamPresetUsable } from "@/lib/themes/team-preset-access";
import { artifactCoverInputSchema, coverFileId } from "@/lib/covers/cover";
import { artifactSizeProblem } from "@/lib/artifact-limits";
import { defaultCommentSetting } from "@/lib/comments/setting-rules";
import { PREVIEW_CHARS, previewKinds } from "@/lib/artifact-preview";
import { loadProjectFacets, projectFilterCondition, projectSearchCondition, projectsForViewer, type ProjectFacets, type ProjectFilter } from "@/lib/projects/queries";
import { loadTagFacets, tagFilterCondition, tagSearchCondition, tagsForViewer, type TagFacet } from "@/lib/tags/queries";
import { assertRoomForNewTags, parseNewTags } from "@/lib/tags/store";
import { projectChoiceSchema } from "@/lib/projects/rules";
import { findOrCreateProject } from "@/lib/projects/store";
import { checkContentFiles } from "@/lib/files/attach";
import { pruneUnusedIconFilesQuietly } from "@/lib/files/icon-cleanup";
import { checkIconFile, restorableIcon } from "@/lib/files/icon-file";
import { checkCoverFile, restorableCover } from "@/lib/files/cover-file";
import { attachFileRows, deleteArtifactFiles, listFilesForArtifacts } from "@/lib/files/store";
import type { FileDto } from "@/lib/files/types";
import { generatePublicId } from "@/lib/public-id";
import { assertContentFits } from "@/lib/quota/usage";
import type { SharingActor } from "@/lib/sharing/rules";
import { StaleSaveError, unchangedSince, type SaveOptions } from "@/lib/save-guard";
import { showsInSearch } from "@/lib/search/search-rules";
import { UserFacingError } from "@/lib/user-facing-error";
import { forgetArtifactCache } from "@/lib/versions/cache";
import { getVersionOf } from "@/lib/versions/history";
import { recordArtifactSave } from "@/lib/versions/service";

/**
 * Artifact storage. The author and members of the team an artifact is shared
 * through edit it (getEditableArtifact); only the author, or the person who
 * added the agent that wrote it, deletes it (findDeletableArtifact). Every
 * save files a version. Visibility never changes here: sharing goes through
 * requestArtifactSharing in src/lib/sharing.
 */

export const artifactUpdateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  // One emoji or an allowed "tabler:<name>"; null or "" removes it. Reviewed like the title.
  icon: artifactIconInputSchema.optional(),
  // A preset id or theme JSON (checked and normalised); null or "" removes it. Reviewed like the title.
  theme: artifactThemeInputSchema.optional(),
  // A gradient id or "file:<uuid>[@0-100]"; null or "" removes it. Reviewed like the title.
  cover: artifactCoverInputSchema.optional(),
  summary: z.string().trim().max(600).optional(),
  // Empty only for file artifacts, whose content is optional notes; validateArtifactContent checks.
  content: z.string().max(1_000_000).optional(),
  kind: z.enum(artifactKinds).optional(),
  language: z.string().trim().max(60).optional(),
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
    // A project name, found or created among the author's projects; "" or null for none. Not part of updates: see src/lib/projects.
    project: projectChoiceSchema.optional().default(null),
    // Tags, checked and normalized in parseNewTags. Not part of updates: see src/lib/tags.
    tags: z.array(z.string()).optional(),
    sessionId: artifactUpdateSchema.shape.sessionId.default(""),
    source: artifactUpdateSchema.shape.source.default(""),
    metadata: artifactUpdateSchema.shape.metadata.default({}),
  });

/** Throws a UserFacingError when content or metadata is over the per-artifact size cap. */
function assertArtifactSize(input: { content?: string | undefined; metadata?: Record<string, unknown> | undefined }) {
  const problem = artifactSizeProblem(input);
  if (problem) throw new UserFacingError(problem);
}


/** Open requests on one artifact. */
export interface PendingRequests {
  sharing: PendingSharingDto | null;
  edit: PendingEditDto | null;
  comments: PendingCommentsDto | null;
}

const noPending: PendingRequests = { sharing: null, edit: null, comments: null };

/** What a DTO carries beyond the row: open requests, files, the last editor, and the project the viewer may see. */
interface DtoExtras {
  pending: PendingRequests;
  files: FileDto[];
  updatedBy: ArtifactEditorDto | null;
  project: ArtifactProjectDto | null;
  tags: string[];
  actsForAuthor: boolean;
}

const noExtras: DtoExtras = { pending: noPending, files: [], updatedBy: null, project: null, tags: [], actsForAuthor: false };

/** Maps a row without content to the shared DTO fields. */
function toArtifactMeta(record: ArtifactMetaRecord, { pending, files, updatedBy, project, tags, actsForAuthor }: DtoExtras): Omit<ArtifactDto, "content"> {
  return {
    id: record.id,
    publicId: record.publicId,
    title: record.title,
    icon: record.icon,
    theme: record.theme,
    cover: record.cover,
    fullWidth: record.fullWidth,
    summary: record.summary,
    kind: record.kind,
    language: record.language,
    project,
    tags,
    sessionId: record.sessionId,
    source: record.source,
    visibility: record.visibility,
    comments: record.comments,
    showInSearch: showsInSearch(record),
    teamId: record.teamId,
    authorId: record.userId,
    actsForAuthor,
    originalAuthorId: record.originalAuthorId,
    pendingSharing: pending.sharing,
    pendingEdit: pending.edit,
    pendingComments: pending.comments,
    files,
    updatedBy,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** Maps a row to the workspace's DTO. Without extras it shows no project. */
export function toArtifactDto(record: ArtifactRecord, extras: DtoExtras = noExtras): ArtifactDto {
  return { ...toArtifactMeta(record, extras), content: record.content };
}

function pendingEntry(map: Map<string, PendingRequests>, artifactId: string): PendingRequests {
  const entry = map.get(artifactId) ?? { ...noPending };
  map.set(artifactId, entry);
  return entry;
}

/** Open sharing, edit, and comments requests for these artifacts, by artifact id. */
export async function pendingRequestsFor(artifactIds: string[]): Promise<Map<string, PendingRequests>> {
  const byArtifact = new Map<string, PendingRequests>();
  if (artifactIds.length === 0) return byArtifact;
  const rows = await getDb()
    .select()
    .from(sharingRequest)
    .where(and(inArray(sharingRequest.artifactId, artifactIds), eq(sharingRequest.status, "pending")));
  for (const row of rows) {
    const requestedAt = row.createdAt.toISOString();
    const entry = pendingEntry(byArtifact, row.artifactId);
    if (row.kind === "edit") entry.edit = { requestId: row.id, requestedAt };
    else if (row.kind === "comments") entry.comments = { requestId: row.id, comments: row.comments ?? "signed_in", requestedAt };
    else entry.sharing = { requestId: row.id, level: row.visibility, teamId: row.teamId, comments: row.comments, requestedAt };
  }
  return byArtifact;
}

/** Who saved each artifact last, by user id. People and agents who are gone are left out. */
export async function lastEditorsFor(records: Pick<ArtifactRecord, "updatedBy">[]): Promise<Map<string, ArtifactEditorDto>> {
  const ids = records.flatMap((record) => (record.updatedBy ? [record.updatedBy] : []));
  const actors = await loadActors(ids);
  return new Map([...actors].map(([id, actor]) => [id, { id, kind: actor.kind, handle: actor.handle, name: actor.name }]));
}

/** Each row's extras, loaded together. `viewerId` decides whose projects show (src/lib/projects/queries.ts). */
async function loadExtras(rows: ArtifactMetaRecord[], viewerId: string): Promise<(row: ArtifactMetaRecord) => DtoExtras> {
  const ids = rows.map((row) => row.id);
  const [pending, files, editors, projects, tags, agents] = await Promise.all([
    pendingRequestsFor(ids),
    listFilesForArtifacts(ids),
    lastEditorsFor(rows),
    projectsForViewer(rows, viewerId),
    tagsForViewer(rows, viewerId),
    ownedAgentIds(viewerId),
  ]);
  return (row) => ({
    pending: pending.get(row.id) ?? noPending,
    files: files.get(row.id) ?? [],
    updatedBy: row.updatedBy ? editors.get(row.updatedBy) ?? null : null,
    project: projects.get(row.id) ?? null,
    tags: tags.get(row.id) ?? [],
    actsForAuthor: row.userId !== viewerId && agents.has(row.userId),
  });
}

/**
 * Maps rows to DTOs for one viewer, with their open sharing and edit
 * requests, files, last editor, and the project when the viewer may see it
 * (the author and members of the team it is shared through).
 */
export async function toArtifactDtos(records: ArtifactRecord[], viewerId: string): Promise<ArtifactDto[]> {
  const extras = await loadExtras(records, viewerId);
  return records.map((record) => toArtifactDto(record, extras(record)));
}

/** Maps list rows (no content, with a preview) to list DTOs for one viewer. */
async function toArtifactListItems(rows: (ArtifactMetaRecord & { preview: string })[], viewerId: string): Promise<ArtifactListItemDto[]> {
  const extras = await loadExtras(rows, viewerId);
  return rows.map((row) => ({ ...toArtifactMeta(row, extras(row)), preview: row.preview }));
}

/** The preview column: the first characters of readable formats, computed in Postgres so content never leaves it. */
const previewColumn = sql<string>`case when ${artifact.kind} in (${sql.join(previewKinds.map((kind) => sql`${kind}`), sql`, `)}) then left(${artifact.content}, ${PREVIEW_CHARS}) else '' end`;

/** Which artifacts a list shows: the viewer's own (with their agents'), or those shared with one of their teams. */
export type ArtifactScope = { kind: "mine" } | { kind: "team"; teamId: string };

export interface ListOptions {
  scope?: ArtifactScope | undefined;
  query?: string | undefined;
  /** Only artifacts in a project with this name key, or with no project. */
  project?: ProjectFilter | undefined;
  /** Only artifacts carrying every one of these normalized tags. */
  tags?: readonly string[] | undefined;
  limit?: number | undefined;
}

/** Search in the title, summary, content, the project's name, and the tags. */
async function searchCondition(viewerId: string, scope: ArtifactScope, query: string | undefined) {
  const text = query?.trim();
  if (!text) return undefined;
  const pattern = `%${text}%`;
  const [inProject, inTags] = await Promise.all([projectSearchCondition(viewerId, scope, pattern), tagSearchCondition(viewerId, pattern)]);
  return or(ilike(artifact.title, pattern), ilike(artifact.summary, pattern), ilike(artifact.content, pattern), inProject, inTags);
}

function scopeCondition(viewerId: string, scope: ArtifactScope) {
  if (scope.kind === "mine") return authoredByViewerCondition(getDb(), viewerId);
  return viewableInTeamCondition(viewerId, scope.teamId);
}

/** The project filter's entries and counts for a list scope (every artifact, not only the first page). */
export async function listProjectFacets(viewerId: string, scope: ArtifactScope): Promise<ProjectFacets> {
  return loadProjectFacets(viewerId, scope, scopeCondition(viewerId, scope));
}

/** The tag filter's entries and counts for a list scope, among artifacts whose tags the viewer may see. */
export async function listTagFacets(viewerId: string, scope: ArtifactScope): Promise<TagFacet[]> {
  return loadTagFacets(viewerId, scopeCondition(viewerId, scope));
}

/**
 * Lists artifacts the viewer may read in one scope, newest first. The team
 * scope checks membership in the query itself, so a non-member gets nothing.
 * Items carry a short preview, never content: load one artifact to read it.
 */
export async function listArtifacts(viewerId: string, options: ListOptions = {}): Promise<ArtifactListItemDto[]> {
  const scope = options.scope ?? { kind: "mine" };
  const conditions: SQL[] = [scopeCondition(viewerId, scope)];
  const search = await searchCondition(viewerId, scope, options.query);
  if (search) conditions.push(search);
  if (options.project) conditions.push(await projectFilterCondition(viewerId, scope, options.project));
  if (options.tags && options.tags.length > 0) conditions.push(await tagFilterCondition(viewerId, options.tags));

  const rows = await getDb()
    .select({ ...artifactMetaColumns(), preview: previewColumn })
    .from(artifact)
    .where(and(...conditions))
    .orderBy(desc(artifact.updatedAt))
    .limit(Math.min(Math.max(options.limit ?? 100, 1), 100));

  return toArtifactListItems(rows, viewerId);
}

/** The DTO of an artifact the editor may edit, as they see it, or null when they may not. */
export async function getEditableArtifactDto(editorId: string, id: string): Promise<ArtifactDto | null> {
  const record = await getEditableArtifact(editorId, { id });
  if (!record) return null;
  const [dto] = await toArtifactDtos([record], editorId);
  return dto ?? null;
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
  const { project: projectName, tags: tagInput, ...parsed } = artifactInputSchema.parse(input);
  const tags = parseNewTags(tagInput);
  assertArtifactSize(parsed);
  assertValidArtifactContent(parsed.kind, parsed.content);
  const contentFileIds = await checkContentFiles(userId, null, parsed.kind, parsed.content);
  const imageFileIds = [...(await checkIconFile(userId, null, parsed.icon)), ...(await checkCoverFile(userId, null, parsed.cover))];
  const fileIds = [...new Set([...contentFileIds, ...imageFileIds])];
  // New artifacts are private: a team preset must be one of the author's teams'.
  await assertTeamPresetUsable(userId, { userId, visibility: "private", teamId: null }, parsed.theme);
  await enforceRateLimit("artifactCreate", userId);
  await assertContentFits(userId, parsed.content);
  // New artifacts are private, so their project is among the author's own.
  await assertRoomForNewTags(userId, tags);
  const chosen = projectName ? await findOrCreateProject({ kind: "user", userId }, projectName, userId) : null;
  const [record] = await getDb()
    .insert(artifact)
    .values({
      ...parsed,
      projectId: chosen?.id ?? null,
      tags,
      id: randomUUID(),
      shareId: randomUUID().replaceAll("-", ""),
      publicId: generatePublicId(),
      visibility: "private",
      // New artifacts start private, so comments stay with the author until it is shared.
      comments: defaultCommentSetting({ visibility: "private", teamPersonal: null }),
      userId,
      updatedBy: userId,
    })
    .returning();

  if (!record) throw new Error("The artifact could not be created.");
  await attachFileRows(userId, record.id, fileIds);
  await recordArtifactSave({ before: null, after: record, editorId: userId, actor: "person", saveKind: "create" });
  const [dto] = await toArtifactDtos([record], userId);
  return dto ?? toArtifactDto(record);
}

/** True when a save replaced or removed an uploaded image icon or cover. */
function imageChanged(before: ArtifactRecord, after: ArtifactRecord): boolean {
  return (iconFileId(before.icon) !== null && after.icon !== before.icon) || (coverFileId(before.cover) !== null && after.cover !== before.cover);
}

interface SaveContext {
  editorId: string;
  before: ArtifactRecord;
  actor: SharingActor;
  options: SaveOptions;
  restoredFromId?: string | null;
}

/** How a save is filed: a restore stands alone; an edit may belong to an editing session. */
function saveKindOf(context: SaveContext) {
  if (context.restoredFromId) return { saveKind: "restore" as const, restoredFromId: context.restoredFromId };
  return { saveKind: "edit" as const, restoredFromId: null, session: context.options.session };
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
  if (changes.content !== undefined) await assertContentFits(before.userId, changes.content, before.content, editorId);
  await assertValidArtifactUpdate(changes, () => Promise.resolve(before));
  // A restore keeps the version's theme as it was; a team preset it may no longer use just falls back.
  if (!context.restoredFromId && changes.theme !== before.theme) await assertTeamPresetUsable(editorId, before, changes.theme);
  await attachUpdatedContentFiles(editorId, before, changes);
  const [record] = await getDb()
    .update(artifact)
    .set({ ...changes, updatedBy: editorId, updatedAt: new Date() })
    .where(and(eq(artifact.id, before.id), unchangedSince(context.options.expectedUpdatedAt, before.publicId)))
    .returning();

  if (!record) {
    if (context.options.expectedUpdatedAt) throw new StaleSaveError(before.publicId);
    return null;
  }
  await recordArtifactSave({ before, after: record, editorId, actor: context.actor, ...saveKindOf(context) });
  // A replaced or removed image icon or cover goes with this save, unless something still shows it (see icon-cleanup.ts).
  if (imageChanged(before, record)) await pruneUnusedIconFilesQuietly(record.id, [before.icon, before.cover]);
  const [dto] = await toArtifactDtos([record], editorId);
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
  // The project is not versioned: a restore keeps the artifact in its current project.
  const { title, theme, summary, content, kind, language, source, metadata } = version;
  const [icon, cover] = await Promise.all([restorableIcon(userId, before.id, version.icon), restorableCover(userId, before.id, version.cover)]);
  const changes = artifactUpdateSchema.parse({ title, icon, theme, cover, summary, content, kind, language, source, metadata });
  assertArtifactSize(changes);
  return saveChanges(changes, { editorId: userId, before, actor, options, restoredFromId: version.id });
}

/**
 * Checks and attaches the files an update's content and icon point at, before the
 * row changes, so a version saved with the edit already includes them.
 */
async function attachUpdatedContentFiles(userId: string, current: ArtifactRecord, update: { kind?: string | undefined; content?: string | undefined; icon?: string | null | undefined; cover?: string | null | undefined }) {
  const iconFileIds = [...(await checkIconFile(userId, current.id, update.icon)), ...(await checkCoverFile(userId, current.id, update.cover))];
  const contentChanged = update.kind !== undefined || update.content !== undefined;
  const contentFileIds = contentChanged ? await checkContentFiles(userId, current.id, update.kind ?? current.kind, update.content ?? current.content) : [];
  await attachFileRows(userId, current.id, [...new Set([...contentFileIds, ...iconFileIds])]);
}

/** Deletes an artifact and its files, for its author or the person who added the agent that wrote it. */
export async function deleteArtifact(userId: string, id: string) {
  const own = await findDeletableArtifact(userId, { id });
  if (!own) return false;
  await deleteArtifactFiles(own.id).catch((error: unknown) => {
    // The rows lose their artifact when it goes; the cleanup job removes them.
    console.error("[files] Files of a deleted artifact were left for cleanup", error instanceof Error ? error.name : "unknown error");
  });
  const [record] = await getDb()
    .delete(artifact)
    .where(and(eq(artifact.userId, own.userId), eq(artifact.id, id)))
    .returning();

  forgetArtifactCache(own.id);
  return Boolean(record);
}
