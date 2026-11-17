import { toArtifactListItem } from "@/lib/artifact-preview";
import { loadArtifactForViewer } from "@/lib/artifact-read";
import { publicIdForRef } from "@/lib/artifact-ref/resolve";
import { ARTIFACT_REF_MAX_CHARS, parseArtifactRef } from "@/lib/artifact-ref/rules";
import type { ArtifactListItemDto } from "@/lib/artifact-types";
import { mayExportCsv } from "@/lib/csv-export/rules";
import { siteOrigin } from "@/lib/site-origin";
import { UserFacingError } from "@/lib/user-facing-error";

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

/** How long the text of a search may be. */
export const SEARCH_TEXT_MAX_CHARS = 300;

/** How long a search query may be: search text is shorter, but an artifact's link to one block carries the block's words. */
export const SEARCH_QUERY_MAX_CHARS = ARTIFACT_REF_MAX_CHARS;

/** What a query too long for search text is told, unless it is an artifact's link. */
export const LONG_QUERY_MESSAGE = `Search text is at most ${String(SEARCH_TEXT_MAX_CHARS)} characters. A longer query is read only as an artifact's link; to open an artifact from its link or id, use artifacts_get.`;

interface ReferencedSearch {
  userId: string;
  query: string | undefined;
  /** True when a project or tags narrow the list: the named artifact is then left to the filters. */
  filtered: boolean;
  limit: number;
  /** The text search, which the caller scopes and filters. */
  search: (text: string | undefined) => Promise<ArtifactListItemDto[]>;
}

/**
 * A search whose query may name one artifact: the artifact first, then the
 * text matches. A query longer than search text may be is never searched as
 * text: it is an artifact's link (the artifact alone, or nothing when the
 * caller may not read it), or it is refused.
 */
export async function searchWithReferenced({ userId, query, filtered, limit, search }: ReferencedSearch): Promise<ArtifactListItemDto[]> {
  if ((query?.length ?? 0) <= SEARCH_TEXT_MAX_CHARS) {
    const [named, items] = await Promise.all([filtered ? null : referencedListItem(userId, query), search(query)]);
    return withReferenced(named, items, limit);
  }
  if (!parseArtifactRef(query ?? "", siteOrigin()).ok) throw new UserFacingError(LONG_QUERY_MESSAGE);
  const named = filtered ? null : await referencedListItem(userId, query);
  return named ? [named] : [];
}
