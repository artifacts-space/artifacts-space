"use client";

import { IconPalette } from "@tabler/icons-react";
import { useState } from "react";

import { ThemePicker } from "@/components/artifact-theme/theme-picker";
import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { ThemeBackdrop, ThemeScope } from "@/components/artifact-view/theme-scope";
import { Button } from "@/components/ui/button";
import { themeLabel } from "@/lib/themes/artifact-theme";
import { resolveTheme } from "@/lib/themes/resolve";

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
