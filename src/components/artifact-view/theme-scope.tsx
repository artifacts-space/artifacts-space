"use client";

import { useMemo, type ComponentProps, type ReactNode } from "react";
import { preload } from "react-dom";

import type { PaletteMode } from "@/lib/themes/derive";
import { siteDefaultTheme } from "@/lib/themes/resolve";
import type { Theme } from "@/lib/themes/schema";
import { themeBackdropStyle, themeKey, themeScopeProps } from "@/lib/themes/style";
import { cn } from "@/lib/utils";

import { ThemeScopeContext, type ThemeScopeValue } from "./theme-scope-context";

/** One vendored face's stylesheet. React hoists it into <head> once, however many scopes use it. */
function FontStylesheet({ href }: { href: string }) {
  return <link rel="stylesheet" href={href} precedence="theme-fonts" />;
}

type ThemeScopeProps = Omit<ComponentProps<"div">, "style"> & {
  /** A validated theme (from `resolveTheme` or a preset). Defaults to the site theme. */
  theme?: Theme | null;
  /** Forces a mode whatever the theme and the reader say (the /preview panels). */
  mode?: PaletteMode;
  children: ReactNode;
};

/**
 * Applies a theme to everything inside it. The theme's tokens become CSS
 * custom properties on this wrapper (via React's `style`, never a <style>
 * string), with the same names as src/app/globals.css, so cards, charts,
 * code blocks, Mermaid, and the CSV grid follow with no changes of their
 * own. Colors follow the reader's light or dark choice unless the theme (or
 * `mode`) pins one. Only the faces the theme uses are loaded: their
 * stylesheets are added to <head> and the text faces are preloaded; Geist,
 * the site font, is always there.
 */
export function ThemeScope({ theme, mode, className, children, ...rest }: ThemeScopeProps) {
  const resolved = theme ?? siteDefaultTheme();
  const props = useMemo(() => themeScopeProps(resolved, mode), [resolved, mode]);
  const context = useMemo<ThemeScopeValue>(() => ({ mode: props.modeClass, key: themeKey(resolved) }), [props.modeClass, resolved]);
  for (const href of props.preloads) preload(href, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <ThemeScopeContext.Provider value={context}>
      {props.stylesheets.map((href) => <FontStylesheet key={href} href={href} />)}
      <div {...rest} className={cn("artifact-theme", props.modeClass, className)} style={props.style}>
        {children}
      </div>
    </ThemeScopeContext.Provider>
  );
}

type ThemeBackdropProps = Omit<ComponentProps<"div">, "style"> & {
  theme?: Theme | null;
  mode?: PaletteMode;
  children?: ReactNode;
};

/**
 * Paints the theme's background behind an artifact, and nothing else: the
 * site header, comments, and controls placed on it keep the standard look.
 * Wrap the content area of the artifact page in it, and the artifact itself
 * in a ThemeScope with the same theme.
 */
export function ThemeBackdrop({ theme, mode, className, children, ...rest }: ThemeBackdropProps) {
  const style = useMemo(() => themeBackdropStyle(theme ?? siteDefaultTheme(), mode), [theme, mode]);
  return (
    <div {...rest} className={cn("theme-backdrop", className)} style={style}>
      {children}
    </div>
  );
}
