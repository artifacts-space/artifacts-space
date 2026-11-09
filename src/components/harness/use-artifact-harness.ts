import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { setArtifactHarnessAction } from "@/app/(workspace)/app/harness-actions";
import type { ArtifactDto, ArtifactHarnessDto } from "@/lib/artifact-types";
import { harnessFor, type HarnessId } from "@/lib/harness/harnesses";

/** The More menu's "Made with" state: what the artifact shows, and the change it makes. */
export interface HarnessControl {
  harness: ArtifactHarnessDto | null;
  pending: boolean;
  onChange: (next: HarnessId | null) => void;
}

/**
 * "Made with" for an editor. It saves at once, apart from the draft: no
 * version in History, no approval. The byline changes when the save lands.
 */
export function useArtifactHarness(artifact: ArtifactDto, onUpdated: (artifact: ArtifactDto) => void): HarnessControl {
  // A save can finish after the editor moved on; merge into the newest artifact, not the one from the click.
  const latest = useRef(artifact);
  useEffect(() => { latest.current = artifact; }, [artifact]);
  const [pending, setPending] = useState(false);

  const change = useCallback(async (next: HarnessId | null) => {
    setPending(true);
    try {
      const result = await setArtifactHarnessAction(latest.current.id, next);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onUpdated({ ...latest.current, harness: result.data });
      toast.success(result.data ? `Shows as made with ${harnessFor(result.data.id).name}.` : "Shows no agent.");
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }, [onUpdated]);

  // Stable while nothing changed, so the page header's chrome is not republished on every render.
  const { harness } = artifact;
  return useMemo(() => ({ harness, pending, onChange: (next: HarnessId | null) => { void change(next); } }), [harness, pending, change]);
}
