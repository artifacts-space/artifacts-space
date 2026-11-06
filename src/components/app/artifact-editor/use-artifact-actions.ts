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
        return;
      }
      onSuccess(result.data);
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setPending(null);
    }
  }

  async function save() {
    if (!draft.title.trim() || !draft.content.trim()) {
      toast.error("Title and content are required.");
      return;
    }
    await run("save", () => updateArtifactAction(artifact.id, draft), (data) => {
      onUpdated(data);
      toast.success("Saved.");
    });
  }

  async function remove(onDone: () => void) {
    await run("delete", () => deleteArtifactAction(artifact.id), () => {
      onDone();
      onDeleted(artifact.id);
      toast.success("Artifact deleted.");
    });
  }

  return { pending, save, remove };
}
