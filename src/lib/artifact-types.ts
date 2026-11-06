export const artifactKinds = ["markdown", "code", "text", "json"] as const;
export type ArtifactKind = (typeof artifactKinds)[number];
/** Who can read an artifact. Private is the default, even inside a team. */
export const artifactVisibilities = ["private", "team", "link", "public"] as const;
export type ArtifactVisibility = (typeof artifactVisibilities)[number];
/** Visibilities that share an artifact with someone besides its author. */
export const sharingLevels = ["team", "link", "public"] as const;
export type SharingLevel = (typeof sharingLevels)[number];
export const sharingRequestStatuses = ["pending", "approved", "denied", "canceled"] as const;
export type SharingRequestStatus = (typeof sharingRequestStatuses)[number];

/** An open request to share an artifact, waiting for a team owner or admin. */
export interface PendingSharingDto {
  requestId: string;
  level: SharingLevel;
  teamId: string;
  requestedAt: string;
}

export interface ArtifactDto {
  /** Internal id, used by the workspace's own actions. Never shown in URLs. */
  id: string;
  /** The 22-character id in the canonical URL /artifact/<publicId>. */
  publicId: string;
  title: string;
  summary: string;
  content: string;
  kind: ArtifactKind;
  language: string;
  project: string;
  sessionId: string;
  source: string;
  visibility: ArtifactVisibility;
  /** The team it is shared with (team), or whose admins approved it (link, public). */
  teamId: string | null;
  authorId: string;
  /** Set when a team owner took the artifact over from a member who left. */
  originalAuthorId: string | null;
  pendingSharing: PendingSharingDto | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactInput {
  title: string;
  summary?: string | undefined;
  content: string;
  kind?: ArtifactKind | undefined;
  language?: string | undefined;
  project?: string | undefined;
  sessionId?: string | undefined;
  source?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
