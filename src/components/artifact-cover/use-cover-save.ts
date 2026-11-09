"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { useNoteOwnSave } from "@/components/artifact-page/page-editor-chrome";
import { setArtifactCoverAction } from "@/app/artifact/[publicId]/edit-actions";

const PENDING_MESSAGE = "Cover saved. Readers outside the team see it once a team owner or admin approves it.";

/**
 * Saving an artifact's cover from its page: the value shows at once, rolls
 * back on an error, and the page refreshes after the save so the server's
 * copy (and the approval state) takes over.
 */
export function useCoverSave(publicId: string, initial: string | null) {
  const router = useRouter();
  const noteOwnSave = useNoteOwnSave();
  const [cover, setCover] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [, startRefresh] = useTransition();

  async function save(next: string | null): Promise<boolean> {
    const previous = cover;
    setCover(next);
    setSaving(true);
    try {
      const result = await setArtifactCoverAction(publicId, next);
      if (!result.success) {
        setCover(previous);
        toast.error(result.error);
        return false;
      }
      setCover(result.data.cover);
      noteOwnSave(result.data);
      if (result.data.pending) toast.success(PENDING_MESSAGE);
      startRefresh(() => { router.refresh(); });
      return true;
    } catch {
      setCover(previous);
      toast.error("Something went wrong. Check your connection and try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { cover, saving, save };
}
