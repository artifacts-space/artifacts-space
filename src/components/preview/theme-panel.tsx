"use client";

import type { ReactNode } from "react";

import { ArtifactFilesProvider } from "@/components/artifact-view/files-context";
import { ThemeScope } from "@/components/artifact-view/theme-scope";
import { previewFileArtifactFiles, previewFiles } from "@/lib/preview/samples";

import { usePreviewTheme } from "./preview-theme";

/** Preview files are not uploaded: every file shows the planet mark instead. */
const standInUrl = () => "/artifacts-space-icon.png";

export type PanelTheme = "light" | "dark";

/**
 * One themed panel. It is a ThemeScope pinned to `theme` (light or dark),
 * showing the preset chosen at the top of the page, so the panel keeps its
 * mode whatever the site theme is. Files resolve to a local stand-in image;
 * `fileArtifact` picks the smaller list a file artifact shows.
 */
export function ThemePanel({ theme, fileArtifact = false, children }: { theme: PanelTheme; fileArtifact?: boolean; children: ReactNode }) {
  const preset = usePreviewTheme();
  return (
    <ThemeScope theme={preset} mode={theme} className="min-w-0 rounded-lg border bg-background text-foreground" data-preview-theme={theme}>
      <p className="border-b px-3 py-1.5 font-mono text-xs text-muted-foreground">{theme === "light" ? "Light" : "Dark"}</p>
      <div className="min-w-0 overflow-x-auto p-3 sm:p-5">
        <ArtifactFilesProvider files={fileArtifact ? previewFileArtifactFiles : previewFiles} urlFor={standInUrl}>
          {children}
        </ArtifactFilesProvider>
      </div>
    </ThemeScope>
  );
}
