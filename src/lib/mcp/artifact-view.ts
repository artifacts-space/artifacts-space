import type { ArtifactDto, ArtifactVisibility, SharingLevel } from "@/lib/artifact-types";

/** How an artifact looks to an agent. Ids are public ids; internal ids never leave the server. */
export interface McpArtifact {
  id: string;
  url: string;
  title: string;
  summary: string;
  content?: string;
  kind: string;
  language: string;
  project: string;
  sessionId: string;
  source: string;
  visibility: ArtifactVisibility;
  /** The team's slug, shown only when the caller belongs to that team. */
  team: string | null;
  /** An open sharing request, shown only to the author. */
  pendingSharing: { visibility: SharingLevel; team: string | null; requestedAt: string } | null;
  /** When the author's latest edit waits for approval, shown only to the author. */
  pendingEdit: { requestedAt: string } | null;
  isAuthor: boolean;
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

/** Maps a DTO to the agent-facing shape. `includeContent` is false for compact lists. */
export function toMcpArtifact(dto: ArtifactDto, context: McpViewContext, includeContent = true): McpArtifact {
  const isAuthor = dto.authorId === context.viewerId;
  const slug = (teamId: string | null) => (teamId ? context.teamSlugs.get(teamId) ?? null : null);
  const pending = isAuthor && dto.pendingSharing
    ? { visibility: dto.pendingSharing.level, team: slug(dto.pendingSharing.teamId), requestedAt: dto.pendingSharing.requestedAt }
    : null;
  return {
    id: dto.publicId,
    url: context.urlFor(dto.publicId),
    title: dto.title,
    summary: dto.summary,
    ...(includeContent ? { content: dto.content } : {}),
    kind: dto.kind,
    language: dto.language,
    project: dto.project,
    sessionId: dto.sessionId,
    source: dto.source,
    visibility: dto.visibility,
    team: slug(dto.teamId),
    pendingSharing: pending,
    pendingEdit: isAuthor && dto.pendingEdit ? { requestedAt: dto.pendingEdit.requestedAt } : null,
    isAuthor,
    files: dto.files.map(({ id, filename, contentType, size }) => ({ id, filename, contentType, size })),
    metadata: dto.metadata,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}
