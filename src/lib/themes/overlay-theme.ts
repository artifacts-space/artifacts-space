import type { ThemeChromeProps } from "./style";

/** The part of an element this needs: `document.body` in the browser, a stand-in in tests. */
export interface OverlayThemeTarget {
  style: { getPropertyValue(name: string): string; setProperty(name: string, value: string): void; removeProperty(name: string): unknown };
  classList: { contains(name: string): boolean; add(name: string): void; remove(name: string): void };
}

/**
 * Puts an artifact theme's colors and mode lock on `target` (the page's
 * body), so what is drawn outside the themed page (dialogs, menus, and
 * popovers in their portals, and toasts) wears the theme too. Returns the
 * undo: it puts back exactly what it changed, so a value that was already
 * there, and a mode class that is not this theme's, are left alone.
 */
export function applyOverlayTheme(target: OverlayThemeTarget, { style, modeClass }: ThemeChromeProps): () => void {
  const before = new Map<string, string>();
  for (const [name, value] of Object.entries(style)) {
    before.set(name, target.style.getPropertyValue(name));
    target.style.setProperty(name, value);
  }
  const addedClass = modeClass !== null && !target.classList.contains(modeClass);
  if (addedClass) target.classList.add(modeClass);

  return () => {
    for (const [name, value] of before) {
      if (value === "") target.style.removeProperty(name);
      else target.style.setProperty(name, value);
    }
    if (addedClass) target.classList.remove(modeClass);
  };
}
