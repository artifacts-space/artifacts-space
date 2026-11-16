"use client";

import type { ReactNode } from "react";

import { ThemeScope } from "@/components/artifact-view/theme-scope";
import type { Theme } from "@/lib/themes/schema";
import { cn } from "@/lib/utils";

import { pinnedInPane } from "./detail-scroll";
import { surfaceClass } from "./preview-surface";

/**
 * The surface a row of the pane's title block sits on: the same one as the
 * body under it (PreviewSurface), the theme's page color when the artifact
 * is themed and the card otherwise, so the title block and the body read as
 * one page.
 */
export function headSurface(theme: Theme | null): string {
  return surfaceClass(theme);
}

/**
 * The title block of an artifact in the /app pane (title, chips, meta line,
 * save notices), in the artifact's theme, as on its own page. The scope
 * takes no box of its own: its rows stay rows of the pane's scroll box, so
 * they scroll away with the body, and a pinned row (PinnedInPane) can stay
 * over the body. Each row paints the surface itself (`headSurface`).
 */
export function PaneHead({ theme, children }: { theme: Theme | null; children: ReactNode }) {
  return <ThemeScope theme={theme} className="contents text-foreground" data-slot="detail-head">{children}</ThemeScope>;
}

interface PinnedInPaneProps {
  theme: Theme | null;
  /** False leaves the rows where they are, scrolling with the page; the wrapper then takes no box. */
  pinned?: boolean;
  slot?: string;
  children: ReactNode;
}

/**
 * Rows that stay at the top of the pane while the page scrolls under them,
 * on the page's own surface. Phones scroll the window under a toolbar that
 * already sticks, so nothing pins there.
 */
export function PinnedInPane({ theme, pinned = true, slot, children }: PinnedInPaneProps) {
  return <div data-slot={slot} data-pinned={pinned} className={pinned ? cn(pinnedInPane, headSurface(theme)) : "contents"}>{children}</div>;
}
