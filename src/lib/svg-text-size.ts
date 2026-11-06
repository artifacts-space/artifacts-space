/** The smallest text size the app renders, in px (the `text-xs` step). */
export const minTextSize = 13;

/** Mermaid's default font size, in px, used when the SVG declares none. */
const fallbackFontSize = 16;

const fontSizePattern = /font-size\s*[:=]\s*["']?\s*([\d.]+)(px)?\s*["';}\s>]/gi;

/**
 * The smallest font size an SVG declares in px, from CSS (`font-size: 12px`)
 * or attributes (`font-size="12"`). Relative units are skipped. Falls back to
 * 16, Mermaid's default, when the SVG declares none.
 */
export function smallestFontSize(svg: string): number {
  let smallest = Number.POSITIVE_INFINITY;
  for (const match of svg.matchAll(fontSizePattern)) {
    const size = Number(match[1]);
    if (Number.isFinite(size) && size > 0) smallest = Math.min(smallest, size);
  }
  return Number.isFinite(smallest) ? smallest : fallbackFontSize;
}

/**
 * The narrowest an SVG drawn `width` user units wide may be shown before its
 * smallest text drops under 13px. Narrower containers scroll instead.
 */
export function minReadableWidth(width: number, smallestFont: number): number {
  if (width <= 0 || smallestFont <= 0) return 0;
  return Math.ceil((width * minTextSize) / smallestFont);
}
