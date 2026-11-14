"use client";

import { IconPalette } from "@tabler/icons-react";
import { useState } from "react";

import { ThemePicker } from "@/components/artifact-theme/theme-picker";
import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { ThemeBackdrop, ThemeScope } from "@/components/artifact-view/theme-scope";
import { Button } from "@/components/ui/button";
import { themeLabel, type StoredArtifactTheme } from "@/lib/themes/artifact-theme";
import { presetTheme, resolveTheme } from "@/lib/themes/resolve";
import type { Theme } from "@/lib/themes/schema";
import type { ThemeChoices } from "@/lib/themes/theme-choice-types";

const sample = "# Release plan\n\nShip the theme picker, then team presets.\n\n```ts\nexport const ready = true;\n```";

/** The artifact theme picker driving a scope, as the artifact page uses it, for the gallery and its e2e test. */
export function ThemePickerSpecimen() {
  const [theme, setTheme] = useState<string | null>(null);
  const resolved = resolveTheme(theme, null);
  const trigger = (
    <Button type="button" variant="outline" size="sm">
      <IconPalette /> Theme: {themeLabel(theme)}
    </Button>
  );
  return (
    <div className="space-y-3">
      <ThemePicker value={theme} onChange={setTheme} trigger={trigger} />
      <ThemeBackdrop theme={resolved.theme} className="rounded-md p-3 sm:p-5">
        <ThemeScope theme={resolved.theme} className="text-foreground" data-picker-scope={resolved.presetId ?? "custom"}>
          <ArtifactView kind="markdown" content={sample} title="Release plan" language="" />
        </ThemeScope>
      </ThemeBackdrop>
    </div>
  );
}

function builtIn(id: string): Theme {
  const theme = presetTheme(id);
  if (!theme) throw new Error(`No built-in theme ${id}`);
  return theme;
}

/** A team default and one team's presets, as a team member's picker gets them from the server. */
const fixtureChoices: ThemeChoices = {
  groups: [
    {
      teamId: "fixture-team",
      teamName: "Fixture team",
      presets: [
        { ref: "team:fixture-brand", name: "Brand", description: "Our colors for anything a customer reads.", theme: builtIn("ink") },
        { ref: "team:fixture-reports", name: "Reports", description: "", theme: builtIn("editorial") },
      ],
    },
  ],
  inherited: { name: "Brand", theme: builtIn("ink") },
  manageable: [],
};

/**
 * The picker with every group it can show: the artifact's own theme JSON
 * (This artifact), the team default, a team's presets, and the built-ins,
 * for the gallery and its accessibility test.
 */
export function GroupedThemePickerSpecimen() {
  const [theme, setTheme] = useState<StoredArtifactTheme | null>(() => builtIn("ocean"));
  const trigger = (
    <Button type="button" variant="outline" size="sm">
      <IconPalette /> Grouped theme: {themeLabel(theme, new Map([["team:fixture-brand", "Brand"], ["team:fixture-reports", "Reports"]]))}
    </Button>
  );
  return <ThemePicker value={theme} onChange={setTheme} trigger={trigger} choices={fixtureChoices} />;
}
