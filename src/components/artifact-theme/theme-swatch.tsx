"use client";

import { ThemeScope } from "@/components/artifact-view/theme-scope";
import type { Theme } from "@/lib/themes/schema";

/**
 * A small preview of one theme: its page color, a heading and a line of
 * text in its fonts, a card, and its accent and first chart colors. It
 * renders inside a ThemeScope, so it loads that theme's fonts; show it only
 * where someone asked to see themes (an open picker).
 */
export function ThemeSwatch({ theme }: { theme: Theme }) {
  return (
    <ThemeScope theme={theme} aria-hidden className="flex h-20 flex-col justify-between gap-1.5 overflow-hidden rounded-[inherit] bg-background p-2.5 text-left text-foreground">
      <span className="font-heading text-lg leading-none font-medium tracking-[-0.01em]">Aa</span>
      <span className="truncate text-xs text-muted-foreground">Plans and notes</span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-6 rounded-full bg-primary" />
        <span className="size-3 rounded-full bg-series-1" />
        <span className="size-3 rounded-full bg-series-2" />
        <span className="size-3 rounded-full bg-series-3" />
        <span className="ml-auto h-3 w-5 rounded-sm border border-card-edge bg-card" />
      </span>
    </ThemeScope>
  );
}
