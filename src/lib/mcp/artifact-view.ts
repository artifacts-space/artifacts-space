import type { ArtifactDto, ArtifactListItemDto, ArtifactVisibility, CommentSetting, SharingLevel } from "@/lib/artifact-types";

/** How an artifact looks to an agent. Ids are public ids; internal ids never leave the server. */
export interface McpArtifact {
  id: string;
  url: string;
  title: string;
  /** Page icon beside the title: one emoji or "tabler:<name>". Null when none. */
  icon: string | null;
  summary: string;
  /** The full content. Only artifacts_get and writes return it. */
  content?: string;
  /** In lists: the first characters of text formats, "" for structured ones. Call artifacts_get for the content. */
  preview?: string;
  kind: string;
  language: string;
  project: string;
  sessionId: string;
  source: string;
  visibility: ArtifactVisibility;
  /** Who can read and write its comments: off, team, or signed_in. */
  comments: CommentSetting;
  /** The team's slug, shown only when the caller belongs to that team. */
  team: string | null;
  /** An open sharing request, shown only to the author. */
  pendingSharing: { visibility: SharingLevel; team: string | null; comments: CommentSetting | null; requestedAt: string } | null;
  /** An open request to open comments to anyone signed in, shown only to the author. */
  pendingComments: { comments: CommentSetting; requestedAt: string } | null;
  /** When the author's latest edit waits for approval, shown only to the author. */
  pendingEdit: { requestedAt: string } | null;
  isAuthor: boolean;
  /** Who saved it last, as "@handle" (or a name). Null when they are gone. */
  updatedBy: string | null;
  /** Attached files. Get a download link with files_get_download_url. */
  files: { id: string; filename: string; contentType: string; size: number }[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface McpViewContext {
  viewerId: string;
  /** Team id to slug, for the caller's own teams only. */
  teamSlugs: ReadonlyMap<string, string>;
  /** Builds the canonical URL for a public id. */
  urlFor: (publicId: string) => string;
}

/** Maps an artifact, with or without its content, to the agent-facing shape. */
function toMcpShape(dto: Omit<ArtifactDto, "content">, context: McpViewContext): McpArtifact {
  const isAuthor = dto.authorId === context.viewerId;
  const slug = (teamId: string | null) => (teamId ? context.teamSlugs.get(teamId) ?? null : null);
  const pending = isAuthor && dto.pendingSharing
    ? { visibility: dto.pendingSharing.level, team: slug(dto.pendingSharing.teamId), comments: dto.pendingSharing.comments, requestedAt: dto.pendingSharing.requestedAt }
    : null;
  return {
    id: dto.publicId,
    url: context.urlFor(dto.publicId),
    title: dto.title,
    icon: dto.icon,
    summary: dto.summary,
    kind: dto.kind,
    language: dto.language,
    project: dto.project,
    sessionId: dto.sessionId,
    source: dto.source,
    visibility: dto.visibility,
    comments: dto.comments,
    team: slug(dto.teamId),
    pendingSharing: pending,
    pendingComments: isAuthor && dto.pendingComments ? { comments: dto.pendingComments.comments, requestedAt: dto.pendingComments.requestedAt } : null,
    pendingEdit: isAuthor && dto.pendingEdit ? { requestedAt: dto.pendingEdit.requestedAt } : null,
    isAuthor,
    updatedBy: dto.updatedBy ? (dto.updatedBy.handle ? `@${dto.updatedBy.handle}` : dto.updatedBy.name) : null,
    files: dto.files.map(({ id, filename, contentType, size }) => ({ id, filename, contentType, size })),
    metadata: dto.metadata,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

/** Maps a full DTO to the agent-facing shape, with its content. */
export function toMcpArtifact(dto: ArtifactDto, context: McpViewContext): McpArtifact {
  return { ...toMcpShape(dto, context), content: dto.content };
}

/** Maps a list item to the compact agent-facing shape: a preview, never the content. */
export function toMcpListItem(item: ArtifactListItemDto, context: McpViewContext): McpArtifact {
  return { ...toMcpShape(item, context), preview: item.preview };
}
