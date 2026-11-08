"use client";

import { useState } from "react";

import { CoverArt } from "@/components/artifact-cover/cover-art";
import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { ThemeBackdrop, ThemeScope } from "@/components/artifact-view/theme-scope";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PaletteMode } from "@/lib/themes/derive";
import type { Theme } from "@/lib/themes/schema";

const sample = [
  "# Launch plan",
  "",
  "Ship team themes this week, then *polish* the editor.",
  "",
  "> Decisions stay with the artifact, so agents find them later.",
  "",
  "- Presets live in team settings",
  "- The team default fills in for artifacts without a theme",
  "",
  "| Step | Owner |",
  "| --- | --- |",
  "| Review | Ada |",
  "| Ship | Lin |",
  "",
  "```ts",
  "export const ready = true;",
  "```",
].join("\n");

/**
 * The live preview in the preset editor: a sample artifact under a sample
 * cover gradient, drawn by the real ThemeBackdrop and ThemeScope, so what
 * an admin sees is how artifacts will look. Light or dark is picked here,
 * whatever the site is in. `theme` is the last draft that parsed.
 */
export function PresetPreview({ theme }: { theme: Theme | null }) {
  const [mode, setMode] = useState<PaletteMode>("light");
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Preview</p>
        <Tabs value={mode} onValueChange={(value: PaletteMode) => { setMode(value); }}>
          <TabsList aria-label="Preview mode">
            <TabsTrigger value="light">Light</TabsTrigger>
            <TabsTrigger value="dark">Dark</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {theme ? (
        <ThemeBackdrop theme={theme} mode={mode} className="overflow-hidden rounded-xl border" data-preset-preview={mode}>
          <ThemeScope theme={theme} mode={mode}>
            <div className="relative h-16 overflow-hidden" data-preview-cover="">
              <CoverArt cover="tide" />
            </div>
          </ThemeScope>
          <ThemeScope theme={theme} mode={mode} className="p-5 text-foreground" data-preset-preview-scope="">
            <ArtifactView kind="markdown" content={sample} title="Launch plan" language="" />
            <div className="mt-4 flex items-center gap-2">
              <span className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm text-primary-foreground">Approve</span>
              <span className="text-sm text-muted-foreground">Secondary text</span>
            </div>
          </ThemeScope>
        </ThemeBackdrop>
      ) : (
        <p className="rounded-xl border p-5 text-sm text-muted-foreground">The preview shows once every color is a valid CSS color.</p>
      )}
    </div>
  );
}
