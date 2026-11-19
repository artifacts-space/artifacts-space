"use client";

import { useEffect } from "react";

import { applyOverlayTheme } from "@/lib/themes/overlay-theme";
import type { ThemeChromeProps } from "@/lib/themes/style";

/**
 * While an artifact page is shown, gives its theme to what is drawn outside
 * the page's own element: dialogs (History), menus, and popovers render in
 * portals at the end of the body, and toasts above every page, so without
 * this they kept the site's colors on a themed page (the owner, 2026-11-19).
 * It sets the same color tokens and mode lock on the body
 * (applyOverlayTheme) and takes them off when the theme changes or the page
 * goes away. Draws nothing. One per page: two would fight over the body.
 */
export function OverlayTheme({ style, modeClass }: ThemeChromeProps) {
  // The tokens as text: a new object with the same colors must not take the theme off and on again.
  const tokens = JSON.stringify(style);
  useEffect(() => applyOverlayTheme(document.body, { style: JSON.parse(tokens) as ThemeChromeProps["style"], modeClass }), [tokens, modeClass]);
  return null;
}
