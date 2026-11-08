import { useEffect, useState } from "react";

import { searchArtifactsAction } from "@/app/(workspace)/app/actions";
import type { ArtifactListItemDto } from "@/lib/artifact-types";
import type { ProjectFilter } from "@/lib/projects/rules";

/** Wait after the last keystroke before searching on the server. */
const SEARCH_DELAY_MS = 300;

/**
 * Server-side search for the workspace list, which holds previews and not
 * content. Returns the matches for the current query, or null while there is
 * no query or no answer for it yet.
 */
export function useServerSearch(query: string, teamId: string | null, project: ProjectFilter | null, tags: readonly string[]): ArtifactListItemDto[] | null {
  const [results, setResults] = useState<{ query: string; teamId: string | null; items: ArtifactListItemDto[] } | null>(null);
  const trimmed = query.trim();
  // A string, so a new array with the same tags does not search again.
  const tagKey = tags.join("\n");

  useEffect(() => {
    if (!trimmed) return;
    let active = true;
    const timer = setTimeout(() => {
      searchArtifactsAction({ query: trimmed, teamId, project, tags: tagKey ? tagKey.split("\n") : [] })
        .then((result) => {
          if (active && result.success) setResults({ query: trimmed, teamId, items: result.data });
        })
        .catch(() => undefined);
    }, SEARCH_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [trimmed, teamId, project, tagKey]);

  return results !== null && trimmed !== "" && results.query === trimmed && results.teamId === teamId ? results.items : null;
}
