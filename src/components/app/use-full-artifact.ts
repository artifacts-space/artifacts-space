import { useCallback, useEffect, useState } from "react";

import { loadArtifactAction } from "@/app/(workspace)/app/actions";
import type { ArtifactDto, ArtifactListItemDto } from "@/lib/artifact-types";

const loadFailed = "The artifact could not be loaded. Check your connection and try again.";

function byId(artifacts: readonly ArtifactDto[] | undefined): ReadonlyMap<string, ArtifactDto> {
  return new Map(artifacts?.map((artifact) => [artifact.id, artifact]));
}

/** Adds the artifacts not held yet; what is held already (perhaps just saved) stays. */
function withMissing(current: ReadonlyMap<string, ArtifactDto>, artifacts: readonly ArtifactDto[]): ReadonlyMap<string, ArtifactDto> {
  const missing = artifacts.filter((artifact) => !current.has(artifact.id));
  if (missing.length === 0) return current;
  const next = new Map(current);
  for (const artifact of missing) next.set(artifact.id, artifact);
  return next;
}

/** The artifacts held so far, seeded from `initial` and taking new ones each time `initial` changes. */
function useLoaded(initial: readonly ArtifactDto[] | undefined) {
  const [loaded, setLoaded] = useState(() => byId(initial));
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    if (initial) setLoaded((current) => withMissing(current, initial));
  }
  const add = useCallback((artifact: ArtifactDto) => {
    setLoaded((current) => new Map(current).set(artifact.id, artifact));
  }, []);
  return { loaded, add };
}

/**
 * The full artifact behind the selected list item. Lists carry previews
 * only, so content loads when an artifact is opened and is kept for the rest
 * of the visit. Saves and shares hand back the full artifact; `remember`
 * keeps it, so the editor never reloads what it just saved. `initial` seeds
 * artifacts already in hand, including ones a later link hands over (an
 * artifact outside the list, loaded by the server for that link).
 */
export function useFullArtifact(selected: ArtifactListItemDto | null, initial?: readonly ArtifactDto[]) {
  const { loaded, add } = useLoaded(initial);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const selectedId = selected?.id ?? null;
  const selectedPublicId = selected?.publicId ?? null;
  const isLoaded = selectedId !== null && loaded.has(selectedId);

  useEffect(() => {
    if (!selectedId || !selectedPublicId || isLoaded) return;
    let active = true;
    loadArtifactAction(selectedPublicId)
      .then((result) => {
        if (!active) return;
        if (result.success) add(result.data);
        else setFailure({ id: selectedId, message: result.error });
      })
      .catch(() => {
        if (active) setFailure({ id: selectedId, message: loadFailed });
      });
    return () => {
      active = false;
    };
  }, [selectedId, selectedPublicId, isLoaded, attempt, add]);

  const retry = useCallback(() => {
    setFailure(null);
    setAttempt((count) => count + 1);
  }, []);

  return {
    full: selectedId ? loaded.get(selectedId) ?? null : null,
    failure: failure !== null && failure.id === selectedId ? failure.message : null,
    remember: add,
    retry,
  };
}
