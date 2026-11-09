"use client";

import { ThemeScope } from "@/components/artifact-view/theme-scope";
import { UiView } from "@/components/artifact-view/ui-view";

import { focusTheme } from "./focus-theme-fixture";

/** A ui artifact with a switch and a button, as an artifact page draws it. */
const spec = JSON.stringify({
  version: 1,
  root: "root",
  elements: {
    root: { type: "Stack", props: { gap: "md" }, children: ["switch", "button"] },
    switch: { type: "Switch", props: { label: "Dark launch", checked: true }, children: [] },
    button: { type: "Button", props: { label: "Save" }, children: [] },
  },
});

/**
 * A themed artifact whose card is too close to the site's blue for the
 * site's focus ring, for the gallery and the theme focus e2e test. The theme
 * is locked to light, so it shows the same palette on a light or dark page.
 */
export function ThemeFocusSpecimen() {
  return (
    <ThemeScope theme={focusTheme()} className="rounded-md bg-background p-3 text-foreground" data-focus-specimen="">
      <div className="card-surface p-4">
        <UiView content={spec} />
      </div>
    </ThemeScope>
  );
}
