import { useState } from "react";
import { toast } from "sonner";

import { deleteArtifactAction, updateArtifactAction } from "@/app/(workspace)/app/actions";
import type { ActionResult, ArtifactDto } from "@/lib/artifact-types";

import type { ArtifactDraft } from "./use-artifact-draft";

export type PendingAction = "save" | "delete" | null;

interface Options {
  artifact: ArtifactDto;
  draft: ArtifactDraft;
  onUpdated: (artifact: ArtifactDto) => void;
  onDeleted: (id: string) => void;
}

/** Save and delete for one artifact, with a single pending state. Sharing lives in ShareControl. */
export function useArtifactActions({ artifact, draft, onUpdated, onDeleted }: Options) {
  const [pending, setPending] = useState<PendingAction>(null);

  async function run<T>(name: Exclude<PendingAction, null>, action: () => Promise<ActionResult<T>>, onSuccess: (data: T) => void) {
    setPending(name);
    try {
      const result = await action();
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      onSuccess(result.data);
      return true;
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
      return false;
    } finally {
      setPending(null);
    }
  }

  async function save() {
    if (!draft.title.trim() || (draft.kind !== "file" && !draft.content.trim())) {
      toast.error("Title and content are required.");
      return;
    }
    // Refused when someone else saved since this editor opened, so their work is never overwritten.
    await run("save", () => updateArtifactAction(artifact.id, draft, { expectedUpdatedAt: artifact.updatedAt }), (data) => {
      onUpdated(data);
      toast.success(data.pendingEdit ? "Saved. Waiting for approval." : "Saved.");
    });
  }

  /** Deletes the artifact. Resolves true once it is gone. */
  function remove() {
    return run("delete", () => deleteArtifactAction(artifact.id), () => {
      onDeleted(artifact.id);
      toast.success("Artifact deleted.");
    });
  }

  return { pending, save, remove };
}
