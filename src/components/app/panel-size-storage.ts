import { parseStoredSize, rememberedPanels, type PanelSpec } from "@/lib/panel-size-rules";

/**
 * The viewer's panel sizes in localStorage, applied as custom properties on
 * the root element, where the workspace layout reads them. Storage can be
 * missing or blocked (a private window, cleared site data); every access is
 * guarded, and the layout then simply keeps its defaults.
 */

/** The stored size for a panel, or null when none is stored or storage is unavailable. */
export function readPanelSize(panel: PanelSpec): number | null {
  try {
    return parseStoredSize(window.localStorage.getItem(panel.storageKey));
  } catch {
    return null;
  }
}

/** Draws a panel at `size` pixels, or back at its default when `size` is null. */
export function applyPanelSize(panel: PanelSpec, size: number | null) {
  const style = document.documentElement.style;
  if (size === null) style.removeProperty(panel.cssVar);
  else style.setProperty(panel.cssVar, `${String(size)}px`);
}

/** Remembers a panel's size for this viewer, or forgets it when `size` is null. */
export function savePanelSize(panel: PanelSpec, size: number | null) {
  try {
    if (size === null) window.localStorage.removeItem(panel.storageKey);
    else window.localStorage.setItem(panel.storageKey, String(size));
  } catch {
    // Storage is unavailable: the size holds for this visit only.
  }
}

/**
 * Applies every remembered size; for renders the before-paint script did not
 * see, such as a client navigation. A panel with nothing stored keeps what it
 * has, so a size set while storage is blocked holds for the visit.
 */
export function applyStoredPanelSizes() {
  for (const panel of rememberedPanels) {
    const size = readPanelSize(panel);
    if (size !== null) applyPanelSize(panel, size);
  }
}
