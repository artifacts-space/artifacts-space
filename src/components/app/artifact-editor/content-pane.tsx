"use client";

import type { ReactNode } from "react";

import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { ThemeScope } from "@/components/artifact-view/theme-scope";
import { ContentStatus } from "@/components/editor/content-status";
import { PageColumn } from "@/components/page-width/page-column";
import { Textarea } from "@/components/ui/textarea";
import type { ArtifactKind } from "@/lib/artifact-types";
import type { FileDto } from "@/lib/files/types";
import { editColumnClass } from "@/lib/page-width/rules";
import type { Theme } from "@/lib/themes/schema";
import { usesSitePalette } from "@/lib/themes/style";
import { cn } from "@/lib/utils";

import type { ArtifactDraft } from "./use-artifact-draft";

export type EditorMode = "edit" | "preview";
type UpdateDraft = <K extends keyof ArtifactDraft>(key: K, value: ArtifactDraft[K]) => void;

function isProse(kind: ArtifactKind) {
  return kind === "markdown" || kind === "text";
}

function isThemed(theme: Theme | null): boolean {
  return theme !== null && !usesSitePalette(theme);
}

/** A themed artifact sits on its theme's page color, as on its page; an unthemed one keeps the card. */
function surfaceClass(theme: Theme | null) {
  return isThemed(theme) ? "bg-background" : "bg-card";
}

interface ContentPaneProps {
  mode: EditorMode;
  kind: ArtifactKind;
  content: string;
  language: string;
  title: string;
  files: readonly FileDto[];
  /** The artifact's "Full width" setting: both modes keep to the public page's column unless it is on. */
  fullWidth: boolean;
  /** The theme the artifact renders with (useRenderTheme). Null draws it in the site theme. */
  theme?: Theme | null;
  update: UpdateDraft;
}

/**
 * The content textarea in edit mode, or the rendered artifact in preview mode.
 * Both grow to fill the pane but never shrink below their content
 * (`flex-[1_0_auto]`): inside the /app shell the pane has a fixed height, and
 * a shrinkable `flex-1` box stopped at its 460px minimum while the content
 * spilled over the files, Format/Language, and comments below it. Both
 * render inside a ThemeScope with the artifact's theme, as on its page, so
 * the content wears it while the toolbar and sidebar keep the app's look.
 */
export function ContentPane({ mode, kind, content, language, title, files, fullWidth, theme = null, update }: ContentPaneProps) {
  if (mode === "edit") {
    return (
      // The theme spans the pane, around the source's column, as the preview's does.
      <ThemeScope theme={theme} className={cn("flex flex-[1_0_auto] flex-col text-foreground", isThemed(theme) && "bg-background")} data-content-theme="">
        <div className={cn("flex flex-1 flex-col", editColumnClass(fullWidth))} data-full-width={fullWidth}>
          <Textarea
            value={content}
            onChange={(event) => { update("content", event.target.value); }}
            aria-label="Artifact content"
            spellCheck={isProse(kind)}
            className={cn("min-h-[460px] flex-1 resize-y rounded-none border-0 p-6 font-mono text-base leading-7 md:text-sm shadow-none outline-none focus-visible:ring-0 sm:p-8", surfaceClass(theme))}
          />
          <ContentStatus kind={kind} content={content} />
        </div>
      </ThemeScope>
    );
  }
  return (
    <PreviewSurface theme={theme} fullWidth={fullWidth} className="py-5 sm:py-8">
      <ArtifactView kind={kind} content={content} language={language} title={title} files={files} />
    </PreviewSurface>
  );
}

interface PreviewSurfaceProps {
  theme: Theme | null;
  fullWidth: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * The surface a rendered artifact sits on in /app: a ThemeScope with the
 * artifact's theme across the whole pane (its page color when themed, the
 * card otherwise), around the PageColumn that holds the body in the public
 * page's column, so themed and contained compose.
 */
export function PreviewSurface({ theme, fullWidth, className, children }: PreviewSurfaceProps) {
  return (
    <ThemeScope
      theme={theme}
      className={cn("min-h-[460px] min-w-0 flex-[1_0_auto] text-foreground", surfaceClass(theme), className)}
      data-full-width={fullWidth}
      data-content-theme=""
    >
      <PageColumn fullWidth={fullWidth}>{children}</PageColumn>
    </ThemeScope>
  );
}
