import type { ArtifactDto, ArtifactListItemDto, ArtifactVisibility, CommentSetting, SharingLevel } from "@/lib/artifact-types";
import { mcpCoverFields } from "@/lib/covers/cover";
import { harnessFor } from "@/lib/harness/harnesses";
import type { StoredArtifactTheme } from "@/lib/themes/artifact-theme";

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
  summary: string;
  /** The full content. Only artifacts_get and writes return it. */
  content?: string;
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
  /** An open sharing request, shown only to the author (and the person who added the agent that wrote it). */
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

/** The project's name for agents, or "" for none (and for callers outside the team, whose DTO has none). */
function projectName(project: ArtifactDto["project"]): string {
  return project ? project.name : "";
}

/** The harness as agents read it: its id and display name, never how it was detected. */
function mcpHarness(harness: ArtifactDto["harness"]): McpArtifact["harness"] {
  return harness ? { id: harness.id, name: harnessFor(harness.id).name } : null;
}

/** Maps an artifact, with or without its content, to the agent-facing shape. */
function toMcpShape(dto: Omit<ArtifactDto, "content">, context: McpViewContext): McpArtifact {
  const isAuthor = dto.authorId === context.viewerId;
  // The person who added the agent that wrote it shares it as the author would, so they see its open requests too.
  const seesRequests = isAuthor || dto.actsForAuthor === true;
  const slug = (teamId: string | null) => (teamId ? context.teamSlugs.get(teamId) ?? null : null);
  const pending = seesRequests && dto.pendingSharing
    ? { visibility: dto.pendingSharing.level, team: slug(dto.pendingSharing.teamId), comments: dto.pendingSharing.comments, requestedAt: dto.pendingSharing.requestedAt }
    : null;
  return {
    id: dto.publicId,
    url: context.urlFor(dto.publicId),
    title: dto.title,
    icon: dto.icon,
    theme: dto.theme,
    ...mcpCoverFields(dto.cover),
    fullWidth: dto.fullWidth,
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
    pendingSharing: pending,
    pendingComments: seesRequests && dto.pendingComments ? { comments: dto.pendingComments.comments, requestedAt: dto.pendingComments.requestedAt } : null,
    pendingEdit: seesRequests && dto.pendingEdit ? { requestedAt: dto.pendingEdit.requestedAt } : null,
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
