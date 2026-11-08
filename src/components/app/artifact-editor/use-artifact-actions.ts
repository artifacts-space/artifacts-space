import { useState } from "react";
import { toast } from "sonner";

import { deleteArtifactAction } from "@/app/(workspace)/app/actions";
import type { ArtifactDto } from "@/lib/artifact-types";

interface Options {
  artifact: ArtifactDto;
  onDeleted: (id: string) => void;
}

/** Delete for one artifact, with its pending state. Edits autosave (use-autosave.ts); sharing lives in ShareControl. */
export function useArtifactActions({ artifact, onDeleted }: Options) {
  const [deleting, setDeleting] = useState(false);

  /** Deletes the artifact. Resolves true once it is gone. */
  async function remove() {
    setDeleting(true);
    try {
      const result = await deleteArtifactAction(artifact.id);
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      onDeleted(artifact.id);
      toast.success("Artifact deleted.");
      return true;
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
      return false;
    } finally {
      setDeleting(false);
    }
  }

  return { deleting, remove };
}
