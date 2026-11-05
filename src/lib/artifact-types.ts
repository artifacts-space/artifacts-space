export const artifactKinds = ["markdown", "code", "text", "json"] as const;
export type ArtifactKind = (typeof artifactKinds)[number];
export type ArtifactVisibility = "private" | "unlisted";

export type ArtifactDto = {
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
};

export type ArtifactInput = {
  title: string;
  summary?: string;
  content: string;
  kind?: ArtifactKind;
  language?: string;
  project?: string;
  sessionId?: string;
  source?: string;
  visibility?: ArtifactVisibility;
  metadata?: Record<string, unknown>;
};

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
