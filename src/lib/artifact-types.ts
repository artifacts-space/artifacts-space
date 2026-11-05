export const artifactKinds = ["markdown", "code", "text", "json"] as const;
export type ArtifactKind = (typeof artifactKinds)[number];
export type ArtifactVisibility = "private" | "unlisted";

export interface ArtifactDto {
  id: string;
  title: string;
  summary: string;
  content: string;
  kind: ArtifactKind;
  language: string;
  project: string;
  sessionId: string;
  source: string;
  visibility: ArtifactVisibility;
  shareId: string;
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
  visibility?: ArtifactVisibility | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
