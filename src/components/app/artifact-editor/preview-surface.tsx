"use client";

import type { ReactNode } from "react";

import { ThemeScope } from "@/components/artifact-view/theme-scope";
import { PageColumn } from "@/components/page-width/page-column";
import type { Theme } from "@/lib/themes/schema";
import { usesSitePalette } from "@/lib/themes/style";
import { cn } from "@/lib/utils";

/** True when the artifact has a theme of its own rather than the site's colors. */
export function isThemed(theme: Theme | null): boolean {
  return theme !== null && !usesSitePalette(theme);
}

/** A themed artifact sits on its theme's page color, as on its page; an unthemed one keeps the card. */
export function surfaceClass(theme: Theme | null): string {
  return isThemed(theme) ? "bg-background" : "bg-card";
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
