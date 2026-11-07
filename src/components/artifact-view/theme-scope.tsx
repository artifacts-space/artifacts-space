"use client";

import { useTheme } from "next-themes";
import { createContext, useContext, type ReactNode } from "react";

type ScopedTheme = "light" | "dark";

const ThemeScopeContext = createContext<ScopedTheme | null>(null);

/**
 * Pins the theme for views that draw their own colors (Mermaid), to match a
 * `.light` or `.dark` wrapper that re-scopes the CSS tokens. Used by the
 * /preview page, which shows each component in both themes at once.
 */
export function ThemeScope({ theme, children }: { theme: ScopedTheme; children: ReactNode }) {
  return <ThemeScopeContext.Provider value={theme}>{children}</ThemeScopeContext.Provider>;
}

/** True when the nearest ThemeScope, or else the page theme, is dark. */
export function useDarkTheme(): boolean {
  const scoped = useContext(ThemeScopeContext);
  const { resolvedTheme } = useTheme();
  return (scoped ?? resolvedTheme) === "dark";
}
