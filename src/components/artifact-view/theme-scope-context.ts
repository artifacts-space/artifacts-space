"use client";

import { useTheme } from "next-themes";
import { createContext, useContext } from "react";

import type { PaletteMode } from "@/lib/themes/derive";
import type { Theme } from "@/lib/themes/schema";
import type { StrongScope, StrongSurface, SurfaceEngine } from "@/lib/themes/surface-scope";

/** What a ThemeScope tells the views inside it. Kept apart from ThemeScope so a view can read it without loading the theme engine. */
export interface ThemeScopeValue {
  /** The mode the scope's palette is, whatever the reader's, or null when it follows the reader's choice. */
  mode: PaletteMode | null;
  /** Changes whenever the theme does, so views that draw their own colors redraw. */
  key: string;
  /** True inside a surface that follows the reader but shows the mode opposite to the page's: an inverse surface, or a primary one whose accent palette is of the other mode. */
  flipped?: boolean;
  /** True inside an inverse or primary surface (a Box). They do not nest. */
  inStrong?: boolean;
  /** The theme's surface scopes, from ThemeScope. Absent outside one, where the site CSS draws them. */
  surfaces?: SurfaceEngine;
}

export const ThemeScopeContext = createContext<ThemeScopeValue | null>(null);

/** The theme a ThemeScope applies, and the mode it forces, if any. */
export interface ThemeSource {
  theme: Theme;
  mode: PaletteMode | undefined;
}

/**
 * The nearest ThemeScope's own theme. A scope's tokens reach only the elements
 * inside its wrapper, so content that is drawn elsewhere in the document (a
 * dialog) reads the theme here and wraps itself in a ThemeScope of its own.
 * Null outside any scope, where the site theme applies.
 */
export const ThemeSourceContext = createContext<ThemeSource | null>(null);

/** True when the nearest scope shows dark: its palette is dark, or it follows the reader and the page is dark (light, inside a surface that flips the mode). */
export function useDarkTheme(): boolean {
  const scoped = useContext(ThemeScopeContext);
  const { resolvedTheme } = useTheme();
  const dark = (scoped?.mode ?? resolvedTheme) === "dark";
  return scoped?.mode === null && scoped.flipped === true ? !dark : dark;
}

/** What a view needs to draw a strong surface: a class, token values, and the context for the views inside it. */
export type StrongSurfaceProps = Pick<StrongScope, "className" | "style"> & { value: ThemeScopeValue };

/** Outside a ThemeScope the site palette applies, and `theme-invert` (globals.css) is its other mode. */
const siteStrongScope: StrongSurfaceProps = {
  className: "theme-invert",
  style: {},
  value: { mode: null, flipped: true, key: "site:inverse", inStrong: true },
};

/**
 * How to draw an inverse or primary surface here, with the context value for
 * the views inside it; null inside another strong surface, where it only
 * paints the surrounding palette.
 */
export function strongSurfaceScope(scoped: ThemeScopeValue | null, surface: StrongSurface): StrongSurfaceProps | null {
  if (scoped?.inStrong) return null;
  if (!scoped?.surfaces) return siteStrongScope;
  const { className, style, inner } = scoped.surfaces.strong(surface);
  return { className, style, value: { ...inner, inStrong: true } };
}

/** The nearest ThemeScope's theme key, or "site" outside any scope. */
export function useThemeKey(): string {
  return useContext(ThemeScopeContext)?.key ?? "site";
}
