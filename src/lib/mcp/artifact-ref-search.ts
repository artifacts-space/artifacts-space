import { toArtifactListItem } from "@/lib/artifact-preview";
import { loadArtifactForViewer } from "@/lib/artifact-read";
import { publicIdForRef } from "@/lib/artifact-ref/resolve";
import { parseArtifactRef } from "@/lib/artifact-ref/rules";
import type { ArtifactListItemDto } from "@/lib/artifact-types";
import { mayExportCsv } from "@/lib/csv-export/rules";
import { siteOrigin } from "@/lib/site-origin";

/**
 * The artifact a search query names, when the query is an artifact
 * reference (its id, its link, or an older value: see
 * src/lib/artifact-ref/rules.ts) and the caller may read it. It is loaded
 * as artifacts_get loads it, through the one read decision and with the
 * version this caller is served, so a reader outside the team gets the
 * approved title and preview. Null for any other query, for an artifact
 * the caller may not read, and when the lookup fails: the text search
 * still answers.
 *
 * The preview follows the content rule of artifacts_get: a CSV whose owner
 * turned downloads off has none for a caller who cannot edit it.
 */
export async function referencedListItem(userId: string, query: string | undefined): Promise<ArtifactListItemDto | null> {
  if (!query) return null;
  try {
    const parsed = parseArtifactRef(query, siteOrigin());
    if (!parsed.ok) return null;
    const publicId = await publicIdForRef(parsed.ref, userId);
    const loaded = publicId ? await loadArtifactForViewer(publicId, userId) : null;
    if (!loaded) return null;
    const item = toArtifactListItem(loaded.dto);
    return mayExportCsv({ canEdit: loaded.viewable.canEdit }, loaded.dto) ? item : { ...item, preview: "" };
  } catch (error) {
    console.error("[mcp] Artifact reference search failed", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}

/** The list with the artifact the query names first, once, and still no longer than `limit`. */
export function withReferenced(named: ArtifactListItemDto | null, items: readonly ArtifactListItemDto[], limit: number): ArtifactListItemDto[] {
  if (!named) return [...items];
  return [named, ...items.filter((item) => item.publicId !== named.publicId)].slice(0, limit);
}
