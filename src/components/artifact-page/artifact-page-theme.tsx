import type { ComponentProps } from "react";

import { siteDefaultTheme } from "@/lib/themes/resolve";
import type { Theme } from "@/lib/themes/schema";
import { themeChromeProps } from "@/lib/themes/style";
import { cn } from "@/lib/utils";

type ArtifactPageThemeProps = Omit<ComponentProps<"div">, "style"> & {
  /** The artifact's resolved theme. Null or the site default leaves the page as the site draws it. */
  theme: Theme | null;
};

/**
 * Gives everything around an artifact on its page (the header, the comments,
 * and the footer) the artifact theme's colors: the same validated color
 * tokens and mode lock as the ThemeScope around the content, with the site's
 * fonts and radius kept. The page renders it again when the theme changes,
 * so these colors swap with the content. An unthemed artifact emits nothing.
 */
export function ArtifactPageTheme({ theme, className, children, ...rest }: ArtifactPageThemeProps) {
  const chrome = themeChromeProps(theme ?? siteDefaultTheme());
  return (
    <div {...rest} className={cn("bg-background text-foreground", chrome.modeClass, className)} style={chrome.style}>
      {children}
    </div>
  );
}
