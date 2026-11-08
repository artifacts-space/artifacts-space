"use client";

import { IconCheck, IconCopy, IconDeviceFloppy } from "@tabler/icons-react";

import { useCopyToClipboard } from "@/components/use-copy-to-clipboard";
import { Button } from "@/components/ui/button";
import type { Theme } from "@/lib/themes/schema";
import type { ThemeChoiceTeam } from "@/lib/themes/theme-choice-types";
import { themeExportJson } from "@/lib/themes/theme-import";

interface CustomThemeActionsProps {
  theme: Theme;
  /** Teams the viewer manages presets in; "Save as team preset" shows only for these. */
  teams: readonly ThemeChoiceTeam[];
  /** Opens the preset editor for one team (the picker closes first). */
  onSave: (team: ThemeChoiceTeam) => void;
}

/**
 * Under the picker's note for an artifact with its own theme JSON: copy it
 * (to reuse in a team preset or send to an agent), and, for team owners and
 * admins, save it as a team preset.
 */
export function CustomThemeActions({ theme, teams, onSave }: CustomThemeActionsProps) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <div className="flex flex-wrap gap-1.5 border-b px-3 py-2">
      <Button type="button" size="sm" variant="outline" onClick={() => void copy(themeExportJson(theme))}>
        {copied ? <IconCheck /> : <IconCopy />} {copied ? "Copied" : "Copy theme JSON"}
      </Button>
      {teams.map((team) => (
        <Button key={team.teamId} type="button" size="sm" variant="outline" onClick={() => { onSave(team); }}>
          <IconDeviceFloppy /> {teams.length === 1 ? "Save as team preset" : `Save to ${team.teamName}`}
        </Button>
      ))}
    </div>
  );
}
