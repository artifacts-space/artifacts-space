import type { ArtifactDto, ArtifactListItemDto, ArtifactVisibility, CommentSetting, SharingLevel } from "@/lib/artifact-types";
import { mcpCoverFields } from "@/lib/covers/cover";
import { csvDownloadOffNote, mayExportCsv } from "@/lib/csv-export/rules";
import type { FileDto } from "@/lib/files/types";
import { harnessFor } from "@/lib/harness/harnesses";
import type { SheetFormat } from "@/lib/sheet-format/rules";
import type { StoredArtifactTheme } from "@/lib/themes/artifact-theme";

import { actorOf, listPeople, shortActor, type McpActor, type McpActors } from "./actors";
import { callerAccess, isMemberOfTeam, type CallerAccess, type CallerCan } from "./caller-rules";

/** An attached file as an agent reads it. Fields that are unset, null, or false are left out. */
export interface McpFile {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  /** A page file of an HTML artifact: the relative path its page loads it by. */
  pagePath?: string;
  /** In artifacts_get and write results only: when it was uploaded. */
  createdAt?: string;
  /** When a newer upload replaced its content (it keeps its id, place, and name). Left out until then. */
  replacedAt?: string;
  /** An image's pixel size, when the server could read it. */
  width?: number;
  height?: number;
  /** Editors only: the document embeds it (it changes in the document, so files_replace refuses it). */
  embedded?: true;
  /** Editors only: a version shows it as the icon or cover (it changes through those fields, so files_replace refuses it). */
  pictured?: true;
}

/** How an artifact looks to an agent. Ids are public ids; internal ids never leave the server. */
export interface McpArtifact {
  id: string;
  url: string;
  title: string;
  /** Page icon beside the title: one emoji or "tabler:<name>". Null when none. */
  icon: string | null;
  /** The artifact's own theme: a preset id or theme JSON. Null when it uses the default look. */
  theme: StoredArtifactTheme | null;
  /** The cover banner: a gradient id or "file:<file id>". Null when none. */
  cover: string | null;
  /** An image cover's vertical focal point, 0 (top) to 100 (bottom). Null for gradients and no cover. */
  coverPosition: number | null;
  /** Whether the page shows the body full width (true) or at the reading width (false, the default). */
  fullWidth: boolean;
  /** A CSV's banded rows and column alignment, as every reader sees them. Only on a CSV that has some. */
  sheetFormat?: SheetFormat;
  summary: string;
  /** The full content. artifacts_get returns it, and artifacts_create and artifacts_update when asked (`returnContent`). "" when `contentWithheld` says why. */
  content?: string;
  /** Set when the content is left out: a CSV whose owner turned downloads off, read by a connection that cannot edit it. */
  contentWithheld?: string;
  /** In a write result without the content: the save stored text other than what was sent, and why. Left out when it stored the text as sent. */
  contentAdjusted?: string;
  /** "Allow CSV download": whether readers who cannot edit a CSV may take its data out. Read-only for agents. */
  allowCsvDownload: boolean;
  /** In lists: the first characters of text formats, "" for structured ones. Call artifacts_get for the content. */
  preview?: string;
  kind: string;
  language: string;
  /** The project's name; "" for none. Only the author and members of the team it is shared through see it. */
  project: string;
  /** Its tags; [] for none and for callers outside the team. */
  tags: string[];
  sessionId: string;
  source: string;
  /**
   * The agent harness it was made with, such as { id: "claude-code", name: "Claude Code" }, detected from the
   * MCP connection or chosen by a person. Read-only: agents cannot set it. Null when no agent saved it.
   */
  harness: { id: string; name: string } | null;
  visibility: ArtifactVisibility;
  /** Who can read and write its comments: off, team, or signed_in. */
  comments: CommentSetting;
  /** Whether search engines may list it: only public artifacts that someone who can share them turned this on for in the web app. Read-only for agents. */
  showInSearch: boolean;
  /** The team's slug, shown only when the caller belongs to that team. */
  team: string | null;
  /** Its workspace, for callers who may edit it: its author's Personal one, or the workspace of `team`. Left out for everyone else. */
  home?: "personal" | "team";
  /** An open sharing request, shown only to the author (and the person who added the agent that wrote it). */
  pendingSharing: { visibility: SharingLevel; team: string | null; comments: CommentSetting | null; requestedAt: string } | null;
  /** An open request to open comments to anyone signed in, shown only to the author. */
  pendingComments: { comments: CommentSetting; requestedAt: string } | null;
  /** When the author's latest edit waits for approval, shown only to the author. */
  pendingEdit: { requestedAt: string } | null;
  isAuthor: boolean;
  /** The caller added the agent that wrote it, and is still in its team: they read, edit, share, and delete it as its author would. Left out otherwise. */
  actsForAuthor?: true;
  /** What the caller may do with it, by the rules each tool enforces again: edit, share, comment, delete. */
  can: CallerCan[];
  /** Who wrote it (its owner). Null when they are gone. In artifacts_list, this and the two below are handle and kind; the list's `people` gives each person once in full (listPeople). */
  author: McpActor | null;
  /** Editors only: who wrote it first, when a team owner took it over from a member who left. */
  firstAuthor?: McpActor;
  /** Who saved the version the caller reads. Null when they are gone. */
  updatedBy: McpActor | null;
  /** Attached files. Get a download link with files_get_download_url. */
  files: McpFile[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface McpViewContext {
  viewerId: string;
  /** The caller's own teams, by team id. */
  teams: ReadonlyMap<string, { slug: string; personal: boolean }>;
  /** Builds the canonical URL for a public id. */
  urlFor: (publicId: string) => string;
  /** The people and agents the artifacts name (artifactActorIds), as the caller sees them. Missing ids read as gone. */
  actors: McpActors;
}

/** Every user id an artifact's result names, for loadMcpActors. */
export function artifactActorIds(dtos: readonly Pick<ArtifactDto, "authorId" | "originalAuthorId" | "updatedBy">[]): string[] {
  return dtos.flatMap((dto) => [dto.authorId, dto.originalAuthorId, dto.updatedBy?.id].filter((id): id is string => typeof id === "string"));
}

/** The project's name for agents, or "" for none (and for callers outside the team, whose DTO has none). */
function projectName(project: ArtifactDto["project"]): string {
  return project ? project.name : "";
}

/** The harness as agents read it: its id and display name, never how it was detected. */
function mcpHarness(harness: ArtifactDto["harness"]): McpArtifact["harness"] {
  return harness ? { id: harness.id, name: harnessFor(harness.id).name } : null;
}

/** A file in a list: what it is, and no more. */
function listedFile({ id, filename, contentType, size, pagePath }: FileDto): McpFile {
  return { id, filename, contentType, size, ...(pagePath === undefined ? {} : { pagePath }) };
}

/** A file in a full artifact. The editing flags (embedded, pictured) go to editors only. */
function fullFile(file: FileDto, canEdit: boolean): McpFile {
  const sized = file.width !== undefined && file.height !== undefined ? { width: file.width, height: file.height } : {};
  return {
    ...listedFile(file),
    createdAt: file.createdAt,
    ...(file.replacedAt ? { replacedAt: file.replacedAt } : {}),
    ...sized,
    ...(canEdit && file.embedded === true ? { embedded: true as const } : {}),
    ...(canEdit && file.pictured === true ? { pictured: true as const } : {}),
  };
}

/** The caller's standing toward the artifact, from their own teams. `canEdit` is the access check's decision, when it made one. */
function accessFor(dto: Omit<ArtifactDto, "content">, context: McpViewContext, canEdit: boolean | undefined): CallerAccess {
  const isTeamMember = isMemberOfTeam(dto, new Set(context.teams.keys()));
  const teamPersonal = dto.teamId ? context.teams.get(dto.teamId)?.personal ?? null : null;
  const standing = { viewerId: context.viewerId, isTeamMember, teamPersonal, actsForAuthor: dto.actsForAuthor === true };
  return callerAccess({ userId: dto.authorId, visibility: dto.visibility, teamId: dto.teamId, comments: dto.comments }, canEdit === undefined ? standing : { ...standing, canEdit });
}

/** Open requests, for the author and the person who added the agent that wrote it. */
function requestFields(dto: Omit<ArtifactDto, "content">, context: McpViewContext, slug: (teamId: string | null) => string | null) {
  const seesRequests = dto.authorId === context.viewerId || dto.actsForAuthor === true;
  if (!seesRequests) return { pendingSharing: null, pendingComments: null, pendingEdit: null };
  const { pendingSharing: sharing, pendingComments: comments, pendingEdit: edit } = dto;
  return {
    pendingSharing: sharing ? { visibility: sharing.level, team: slug(sharing.teamId), comments: sharing.comments, requestedAt: sharing.requestedAt } : null,
    pendingComments: comments ? { comments: comments.comments, requestedAt: comments.requestedAt } : null,
    pendingEdit: edit ? { requestedAt: edit.requestedAt } : null,
  };
}

/** Who wrote it, wrote it first, and saved it last, and what the caller may do. A list names people in their short form (shortActor). */
function whoFields(dto: Omit<ArtifactDto, "content">, context: McpViewContext, access: CallerAccess, full: boolean) {
  const shown = (actor: McpActor | null) => (full ? actor : shortActor(actor));
  const firstAuthor = access.canEdit ? shown(actorOf(context.actors, dto.originalAuthorId)) : null;
  return {
    isAuthor: dto.authorId === context.viewerId,
    ...(dto.actsForAuthor === true ? { actsForAuthor: true as const } : {}),
    can: access.can,
    author: shown(actorOf(context.actors, dto.authorId)),
    ...(firstAuthor ? { firstAuthor } : {}),
    updatedBy: shown(actorOf(context.actors, dto.updatedBy?.id)),
  };
}

/** A CSV's formatting, only when it has some. */
function sheetFields(dto: Omit<ArtifactDto, "content">) {
  const { sheetFormat } = dto;
  if (dto.kind !== "csv" || (sheetFormat.banding === null && Object.keys(sheetFormat.align).length === 0)) return {};
  return { sheetFormat };
}

/** Maps an artifact, with or without its content, to the agent-facing shape. `full` adds each file's dates, size in pixels, and editing flags. */
function toMcpShape(dto: Omit<ArtifactDto, "content">, context: McpViewContext, options: { canEdit?: boolean; full: boolean }): McpArtifact {
  const access = accessFor(dto, context, options.canEdit);
  const slug = (teamId: string | null) => (teamId ? context.teams.get(teamId)?.slug ?? null : null);
  return {
    id: dto.publicId,
    url: context.urlFor(dto.publicId),
    title: dto.title,
    icon: dto.icon,
    theme: dto.theme,
    ...mcpCoverFields(dto.cover),
    fullWidth: dto.fullWidth,
    ...sheetFields(dto),
    allowCsvDownload: dto.allowCsvDownload,
    summary: dto.summary,
    kind: dto.kind,
    language: dto.language,
    project: projectName(dto.project),
    tags: dto.tags,
    sessionId: dto.sessionId,
    source: dto.source,
    harness: mcpHarness(dto.harness),
    visibility: dto.visibility,
    comments: dto.comments,
    showInSearch: dto.showInSearch,
    team: slug(dto.teamId),
    ...(access.home ? { home: access.home } : {}),
    ...requestFields(dto, context, slug),
    ...whoFields(dto, context, access, options.full),
    files: dto.files.map((file) => (options.full ? fullFile(file, access.canEdit) : listedFile(file))),
    metadata: dto.metadata,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

/**
 * Maps a full DTO to the agent-facing shape, with its content. `reader`
 * says whether the connection may edit it, as the access check decided: a
 * CSV whose owner turned downloads off comes without its content to one
 * that cannot, as the Markdown and raw versions do (mayExportCsv). Attached
 * files stay listed, here and in artifacts_list: they are outside the rule.
 * Writes pass canEdit: true, since only editors write.
 */
export function toMcpArtifact(dto: ArtifactDto, context: McpViewContext, reader: { canEdit: boolean }): McpArtifact {
  const shape = toMcpShape(dto, context, { canEdit: reader.canEdit, full: true });
  if (!mayExportCsv(reader, dto)) return { ...shape, content: "", contentWithheld: csvDownloadOffNote };
  return { ...shape, content: dto.content };
}

/** Why a save can store text other than what an agent sent (`contentForSave`). */
export const CONTENT_ADJUSTED_NOTE =
  "The saved content differs from what you sent: Markdown keeps links to this site's files in their relative form, and ui and canvas JSON that spelled a file id with escapes is saved re-serialized (parsed and written again, so its spacing can change too). Read it with artifacts_get before you edit the text.";

/**
 * Maps a write's saved DTO to the agent-facing shape. The content is left
 * out unless the agent asked for it (`returnContent`): it just sent that
 * text, and a large page would fill its context for nothing. When the save
 * stored other text than `sent` (see CONTENT_ADJUSTED_NOTE), the result
 * says so, with or without the content. `sent` is undefined when the write
 * sent no content.
 */
export function toMcpWrittenArtifact(dto: ArtifactDto, context: McpViewContext, options: { sent: string | undefined; returnContent: boolean }): McpArtifact {
  const { content, ...rest } = toMcpArtifact(dto, context, { canEdit: true });
  const adjusted = options.sent !== undefined && content !== options.sent ? { contentAdjusted: CONTENT_ADJUSTED_NOTE } : {};
  return options.returnContent && content !== undefined ? { ...rest, content, ...adjusted } : { ...rest, ...adjusted };
}

/** Maps a list item to the compact agent-facing shape: a preview, never the content, and each file without its dates. */
export function toMcpListItem(item: ArtifactListItemDto, context: McpViewContext): McpArtifact {
  return { ...toMcpShape(item, context, { full: false }), preview: item.preview };
}

/**
 * artifacts_list's result: the items, which name people by handle and kind,
 * and `people`, each of them once in full (listPeople). Nothing about a
 * person is left out of a list; it is only not repeated on every row.
 */
export function toMcpList(items: readonly ArtifactListItemDto[], context: McpViewContext) {
  const artifacts = items.map((item) => toMcpListItem(item, context));
  const shown = artifacts.flatMap((item) => [item.author, item.firstAuthor, item.updatedBy]);
  return { people: listPeople(shown, context.actors), artifacts };
}
