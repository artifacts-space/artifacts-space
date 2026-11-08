import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { setArtifactFullWidthAction } from "@/app/(workspace)/app/page-width-actions";
import type { ArtifactDto } from "@/lib/artifact-types";

/** The editor's "Full width" control state: what it is, and the toggle the More menu uses. */
export interface FullWidthControl {
  checked: boolean;
  pending: boolean;
  onChange: (next: boolean) => void;
}

/**
 * The "Full width" setting for the editor. It saves at once, apart from the
 * draft and Save: no version in History. The width changes when the save
 * lands, so what the page shows is always what was stored.
 */
export function useFullWidth(artifact: ArtifactDto, onUpdated: (artifact: ArtifactDto) => void): FullWidthControl {
  // A save can finish after the editor moved on; merge into the newest artifact, not the one from the click.
  const latest = useRef(artifact);
  useEffect(() => { latest.current = artifact; }, [artifact]);
  const [pending, setPending] = useState(false);

  const change = useCallback(async (next: boolean) => {
    setPending(true);
    try {
      const result = await setArtifactFullWidthAction(latest.current.id, next);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onUpdated({ ...latest.current, fullWidth: result.data });
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }, [onUpdated]);

  return { checked: artifact.fullWidth, pending, onChange: (next) => { void change(next); } };
}
