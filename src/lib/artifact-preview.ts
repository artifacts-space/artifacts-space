import type { ArtifactDto, ArtifactKind, ArtifactListItemDto } from "./artifact-types";

/**
 * List previews. Lists never carry full content (it can be up to 1 MB per
 * artifact); readable text formats get their first characters instead, and
 * structured formats (ui, json, svg, file) get none. Client-safe.
 */

/** How many characters a preview keeps. */
export const PREVIEW_CHARS = 280;

/** Formats whose opening text reads well on its own. */
export const previewKinds = ["markdown", "text", "code", "csv", "mermaid"] as const satisfies readonly ArtifactKind[];

const previewable = new Set<string>(previewKinds);

/** The preview for one artifact: its first PREVIEW_CHARS characters, or "" for formats without one. */
export function artifactPreview(kind: string, content: string): string {
  return previewable.has(kind) ? content.slice(0, PREVIEW_CHARS) : "";
}

/** The list item for a full artifact, after a create or an edit in the workspace. */
export function toArtifactListItem(dto: ArtifactDto): ArtifactListItemDto {
  const { content, ...rest } = dto;
  return { ...rest, preview: artifactPreview(dto.kind, content) };
}
