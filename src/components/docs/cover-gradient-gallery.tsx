"use client";

import { ThemeScope } from "@/components/artifact-view/theme-scope";
import { CopyIconButton } from "@/components/copy-icon-button";
import { coverGradientCss, coverGradients, type CoverGradient } from "@/lib/covers/gradients";
import { presetTheme } from "@/lib/themes/resolve";

/** Themes each sample is drawn in: the default look, and one tinted preset to show the gradient following it. */
const sampleThemes = ["default", "ocean"] as const;

/** One gradient in light and dark, in the default look and in Ocean, drawn by the real ThemeScope. */
function GradientCard({ gradient }: { gradient: CoverGradient }) {
  return (
    <li className="card-surface flex min-w-0 flex-col overflow-hidden" data-cover-gradient-sample={gradient.id}>
      <div className="grid grid-cols-2 border-b border-card-edge" aria-hidden>
        {sampleThemes.flatMap((themeId) =>
          (["light", "dark"] as const).map((mode) => (
            <ThemeScope key={`${themeId}-${mode}`} theme={presetTheme(themeId) ?? null} mode={mode} className="h-14">
              <div className="size-full" style={{ backgroundImage: coverGradientCss(gradient) }} />
            </ThemeScope>
          )),
        )}
      </div>
      <div className="flex items-center gap-2 px-4 py-2.5">
        <h3 className="text-md font-medium">{gradient.name}</h3>
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">{gradient.id}</code>
        <CopyIconButton value={gradient.id} label={`Copy the ${gradient.name} cover id`} className="ml-auto" />
      </div>
    </li>
  );
}

/**
 * Every cover gradient, each drawn in light and dark under the default look
 * (top) and the Ocean preset (bottom), so you see how a cover follows the
 * artifact's theme.
 */
export function CoverGradientGallery() {
  return (
    <ul aria-label="Cover gradients" className="mt-6 grid gap-4 sm:grid-cols-2">
      {coverGradients.map((gradient) => <GradientCard key={gradient.id} gradient={gradient} />)}
    </ul>
  );
}
