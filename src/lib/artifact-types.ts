import type { FileDto } from "./files/types";
import type { StoredArtifactTheme } from "./themes/artifact-theme";
import type { Theme } from "./themes/schema";

export const artifactKinds = ["markdown", "code", "text", "json", "csv", "svg", "mermaid", "ui", "file"] as const;
export type ArtifactKind = (typeof artifactKinds)[number];
/** Who can read an artifact. Private is the default, even inside a team. */
export const artifactVisibilities = ["private", "team", "link", "public"] as const;
export type ArtifactVisibility = (typeof artifactVisibilities)[number];
/** Visibilities that share an artifact with someone besides its author. */
export const sharingLevels = ["team", "link", "public"] as const;
export type SharingLevel = (typeof sharingLevels)[number];
/**
 * Who can read and write an artifact's comments. Separate from who can read
 * the artifact. off: nobody; existing comments stay hidden until comments
 * come back. team: the author and members of the artifact's team. signed_in:
 * anyone signed in who can read the artifact.
 */
export const commentSettings = ["off", "team", "signed_in"] as const;
export type CommentSetting = (typeof commentSettings)[number];
export const sharingRequestStatuses = ["pending", "approved", "denied", "canceled"] as const;
export type SharingRequestStatus = (typeof sharingRequestStatuses)[number];
/** sharing: who can read it. edit: new content for a link or public artifact. comments: open comments to anyone signed in. */
export const sharingRequestKinds = ["sharing", "edit", "comments"] as const;
export type SharingRequestKind = (typeof sharingRequestKinds)[number];
/**
 * Why a version was saved. create: the first content. edit: a content or
 * metadata save. files: files were added or removed. restore: an older
 * version was brought back. snapshot: what an artifact showed before history
 * began, or when it was shared.
 */
export const versionSaveKinds = ["create", "edit", "files", "restore", "snapshot"] as const;
export type VersionSaveKind = (typeof versionSaveKinds)[number];
/** Why a reader reports an artifact. */
export const reportReasons = ["spam", "phishing", "malware", "harassment", "illegal", "private_info", "copyright", "other"] as const;
export type ReportReason = (typeof reportReasons)[number];
export const reportStatuses = ["open", "resolved"] as const;
export type ReportStatus = (typeof reportStatuses)[number];

/** An open request to share an artifact, waiting for a team owner or admin. */
export interface PendingSharingDto {
  requestId: string;
  level: SharingLevel;
  teamId: string;
  /** Who may comment once it is approved. */
  comments: CommentSetting | null;
  requestedAt: string;
}

/** A request to open an artifact's comments to anyone signed in, waiting for a team owner or admin. */
export interface PendingCommentsDto {
  requestId: string;
  comments: CommentSetting;
  requestedAt: string;
}

/** Changed content of a link or public artifact, waiting for a team owner or admin. */
export interface PendingEditDto {
  requestId: string;
  requestedAt: string;
}

/** A person or agent who saved an artifact or one of its versions. `id` seeds their pixel avatar. */
export interface ArtifactEditorDto {
  id: string;
  kind: "person" | "agent";
  handle: string | null;
  name: string;
}

/** An artifact's project, as the artifact's author and team see it. Never shown to readers outside the team. */
export interface ArtifactProjectDto {
  id: string;
  name: string;
  /** One emoji or "tabler:<name>". Null when none. */
  icon: string | null;
}

export interface ArtifactDto {
  /** Internal id, used by the workspace's own actions. Never shown in URLs. */
  id: string;
  /** The 22-character id in the canonical URL /artifact/<publicId>. */
  publicId: string;
  title: string;
  /** Page icon beside the title: one emoji or "tabler:<name>". Null when none. */
  icon: string | null;
  /** The artifact's own theme: a preset id or normalised theme JSON. Null uses the default look. */
  theme: StoredArtifactTheme | null;
  /** The cover banner: a gradient id or "file:<uuid>[@0-100]". Null when none. */
  cover: string | null;
  summary: string;
  content: string;
  kind: ArtifactKind;
  language: string;
  /** Its project, for the author and team members only. Null for "No project" and for everyone else. */
  project: ArtifactProjectDto | null;
  /** Its tags, for the author and team members only. Empty for everyone else. */
  tags: string[];
  sessionId: string;
  source: string;
  visibility: ArtifactVisibility;
  /** Who can read and write its comments. */
  comments: CommentSetting;
  /** The team it is shared with (team), or whose admins approved it (link, public). */
  teamId: string | null;
  authorId: string;
  /** Set when a team owner took the artifact over from a member who left. */
  originalAuthorId: string | null;
  pendingSharing: PendingSharingDto | null;
  /** Set when the latest edit waits for approval; readers outside the team still see the approved version. */
  pendingEdit: PendingEditDto | null;
  /** Set when opening comments to anyone signed in waits for approval. */
  pendingComments: PendingCommentsDto | null;
  /** Ready files attached to the artifact, in the order they were added. */
  files: FileDto[];
  /** Who saved it last. Null when they are gone. */
  updatedBy: ArtifactEditorDto | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** One entry in an artifact's history, without its content. */
export interface VersionSummaryDto {
  id: string;
  createdAt: string;
  /** The last save merged into it. Equals createdAt for a single save. */
  savedAt: string;
  saveKind: VersionSaveKind;
  restoredFromId: string | null;
  /** Content plus metadata size. */
  bytes: number;
  kind: ArtifactKind;
  title: string;
  icon: string | null;
  theme: StoredArtifactTheme | null;
  cover: string | null;
  /** Who saved it. Null when they are gone. */
  editor: ArtifactEditorDto | null;
  /** Readers outside the team see this version (link and public artifacts). */
  approved: boolean;
  /** This version waits for a team owner or admin. */
  pending: boolean;
  /** The newest version: what the artifact shows now. */
  latest: boolean;
}

/** One version with everything it saved. */
export interface VersionDetailDto extends VersionSummaryDto {
  /** The theme this version renders with now: its own, else the team default, else the site default. Set by the server. */
  renderTheme?: Theme | undefined;
  summary: string;
  content: string;
  language: string;
  source: string;
  metadata: Record<string, unknown>;
}

/**
 * An artifact in a list: everything but its content, plus a short preview
 * (see artifact-preview.ts). Load the full artifact to read or edit it.
 */
export type ArtifactListItemDto = Omit<ArtifactDto, "content"> & { preview: string };

export interface ArtifactInput {
  title: string;
  /** One emoji or "tabler:<name>"; null or "" for none. */
  icon?: string | null | undefined;
  /** A preset id or theme JSON; null or "" for none. Checked by parseArtifactThemeInput. */
  theme?: StoredArtifactTheme | Record<string, unknown> | null | undefined;
  /** A gradient id or "file:<uuid>[@0-100]"; null or "" for none. */
  cover?: string | null | undefined;
  summary?: string | undefined;
  content: string;
  kind?: ArtifactKind | undefined;
  language?: string | undefined;
  /** A project name, found or created among the author's projects. "" or null for none. */
  project?: string | null | undefined;
  /** Tags, normalized (src/lib/tags/rules.ts). */
  tags?: string[] | undefined;
  sessionId?: string | undefined;
  source?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
