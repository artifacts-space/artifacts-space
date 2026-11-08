"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createTeamPresetAction } from "@/app/(workspace)/teams/theme-actions";
import { PresetEditorDialog, type PresetSaveInput } from "@/components/teams/preset-editor-dialog";
import type { Theme } from "@/lib/themes/schema";
import type { ThemeChoiceTeam } from "@/lib/themes/theme-choice-types";

/**
 * The preset editor, started from the artifact's custom theme, saving a new
 * preset to `team`. Contrast suggestions and every check work as in team
 * settings; the server checks the viewer is an owner or admin again.
 */
export function SaveCustomThemeDialog({ theme, team, onClose }: { theme: Theme; team: ThemeChoiceTeam; onClose: () => void }) {
  const router = useRouter();

  async function save(input: PresetSaveInput) {
    const result = await createTeamPresetAction(team.teamId, input);
    if (result.success) {
      toast.success(`Saved as a ${team.teamName} preset. Team members can pick it now.`);
      onClose();
      router.refresh();
    }
    return result;
  }

  return <PresetEditorDialog kind="save" teamName={team.teamName} start={{ name: "", description: "", theme }} teamPresets={[]} onSave={save} onClose={onClose} />;
}
