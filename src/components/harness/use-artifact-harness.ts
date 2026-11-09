import { useCallback, useEffect, useMemo, useRef, useTransition } from "react";
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
 * version in History, no approval. The save runs in a transition, so the
 * control stays pending until the page has the new byline, and the menu and
 * the byline never disagree.
 */
export function useArtifactHarness(artifact: ArtifactDto, onUpdated: (artifact: ArtifactDto) => void): HarnessControl {
  // A save can finish after the editor moved on; merge into the newest artifact, not the one from the click.
  const latest = useRef(artifact);
  useEffect(() => { latest.current = artifact; }, [artifact]);
  const [pending, startSave] = useTransition();

  const change = useCallback((next: HarnessId | null) => {
    startSave(async () => {
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
      }
    });
  }, [onUpdated]);

  // Stable while nothing changed, so the page header's chrome is not republished on every render.
  const { harness } = artifact;
  return useMemo(() => ({ harness, pending, onChange: change }), [harness, pending, change]);
}
