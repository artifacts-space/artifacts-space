"use client";

import { useTheme } from "next-themes";
import { createContext, useContext } from "react";

import type { PaletteMode } from "@/lib/themes/derive";

/** What a ThemeScope tells the views inside it. Kept apart from ThemeScope so a view can read it without loading the theme engine. */
export interface ThemeScopeValue {
  /** The pinned mode, or null when the scope follows the reader's choice. */
  mode: PaletteMode | null;
  /** Changes whenever the theme does, so views that draw their own colors redraw. */
  key: string;
}

export const ThemeScopeContext = createContext<ThemeScopeValue | null>(null);

/** True when the nearest ThemeScope pins dark, or it follows the reader and the page theme is dark. */
export function useDarkTheme(): boolean {
  const scoped = useContext(ThemeScopeContext);
  const { resolvedTheme } = useTheme();
  return (scoped?.mode ?? resolvedTheme) === "dark";
}

/** The nearest ThemeScope's theme key, or "site" outside any scope. */
export function useThemeKey(): string {
  return useContext(ThemeScopeContext)?.key ?? "site";
}
