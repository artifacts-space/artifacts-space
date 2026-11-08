"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { presetRevisionsAction, restorePresetRevisionAction } from "@/app/(workspace)/teams/theme-actions";
import { draftFromTheme } from "@/lib/themes/preset-draft";
import type { TeamThemeRevisionDto } from "@/lib/themes/team-theme-revisions";
import { importThemeJson } from "@/lib/themes/theme-import";

import { HistoryPanel } from "./theme-history";
import type { PresetEditorState } from "./use-preset-editor";

const STALE_NOTICE = "That older theme fails today's checks, so it is in the editor instead of restored. Apply the suggestions, then save.";

/**
 * The preset editor's History: every saved state of this preset. Restore
 * saves that theme again as a new revision. An old theme that fails today's
 * checks is never restored as is: it opens in the editor with the suggested
 * colors, to fix and save.
 */
export function PresetHistory({ teamId, presetId, editor, disabled }: { teamId: string; presetId: string; editor: PresetEditorState; disabled: boolean }) {
  const router = useRouter();

  async function restore(revision: TeamThemeRevisionDto): Promise<boolean> {
    const checked = importThemeJson(JSON.stringify(revision.theme ?? null));
    if (!checked.ok) {
      toast.error(checked.message);
      return false;
    }
    if (!checked.passes) {
      editor.importDraft(checked.draft);
      toast.warning(STALE_NOTICE);
      return false;
    }
    try {
      const result = await restorePresetRevisionAction(teamId, presetId, revision.id);
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      editor.importDraft(draftFromTheme(result.data.theme));
      toast.success("Restored. Artifacts that use this preset show it now.");
      router.refresh();
      return true;
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
      return false;
    }
  }

  return (
    <HistoryPanel
      title="History"
      load={() => presetRevisionsAction(teamId, presetId)}
      onRestore={restore}
      describe={(revision) => ({ label: revision.name ?? "This preset", theme: revision.theme })}
      disabled={disabled}
    />
  );
}
