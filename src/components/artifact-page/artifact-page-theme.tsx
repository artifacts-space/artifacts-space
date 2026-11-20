import type { ComponentProps } from "react";

import { siteDefaultTheme } from "@/lib/themes/resolve";
import type { Theme } from "@/lib/themes/schema";
import { themeChromeProps } from "@/lib/themes/style";
import { cn } from "@/lib/utils";

import { OverlayTheme } from "./overlay-theme";

type ArtifactPageThemeProps = Omit<ComponentProps<"div">, "style"> & {
  /** The artifact's resolved theme. Null or the site default leaves the page as the site draws it. */
  theme: Theme | null;
  /** Also themes what is drawn outside this element: dialogs, menus, and toasts (OverlayTheme). For the one that wraps a whole page. */
  overlays?: boolean;
};

/**
 * Gives everything around an artifact on its page (the header, the comments,
 * and the footer) the artifact theme's colors: the same validated color
 * tokens and mode lock as the ThemeScope around the content, with the site's
 * fonts and radius kept. The page renders it again when the theme changes,
 * so these colors swap with the content. An unthemed artifact emits nothing.
 * With `overlays`, the page's dialogs, menus, and toasts wear them too.
 */
export function ArtifactPageTheme({ theme, overlays = false, className, children, ...rest }: ArtifactPageThemeProps) {
  const chrome = themeChromeProps(theme ?? siteDefaultTheme());
  return (
    <div {...rest} className={cn("bg-background text-foreground", chrome.modeClass, className)} style={chrome.style}>
      {overlays ? <OverlayTheme style={chrome.style} modeClass={chrome.modeClass} /> : null}
      {children}
    </div>
  );
}
