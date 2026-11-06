/**
 * Geometry for a tab row that scrolls sideways inside itself when its tabs
 * do not fit. Pure functions, so the browser code only reads and writes
 * scroll positions.
 */

/** Width of the edge fade, in px: 2rem, like the Board's fade. */
export const tabFadeWidth = 32;

/** The scroll state of a tab row, in px. */
export interface StripMetrics {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}

/** A tab's position along the row's scrolled content, in px. */
export interface TabSpan {
  start: number;
  end: number;
}

/** Sub-pixel scroll positions count as the edge, so a fade never shows over nothing. */
const edgeSlack = 1;

/**
 * Which edges hide tabs: `start` when the row is scrolled away from its
 * start, `end` when more tabs sit past the right edge. Both are false when
 * every tab fits.
 */
export function stripFades({ scrollLeft, clientWidth, scrollWidth }: StripMetrics): { start: boolean; end: boolean } {
  const overflow = scrollWidth - clientWidth;
  if (overflow <= edgeSlack) return { start: false, end: false };
  return { start: scrollLeft > edgeSlack, end: scrollLeft < overflow - edgeSlack };
}

/**
 * The scroll position that shows `tab` in full and clear of the edge fade,
 * moving as little as possible. Null when the tab is already in view.
 */
export function revealScrollLeft(tab: TabSpan, metrics: StripMetrics, fade = tabFadeWidth): number | null {
  const { scrollLeft, clientWidth, scrollWidth } = metrics;
  const maxScroll = Math.max(0, scrollWidth - clientWidth);
  const clamp = (value: number) => Math.min(maxScroll, Math.max(0, value));
  if (tab.start - fade < scrollLeft) {
    const target = clamp(tab.start - fade);
    return target === scrollLeft ? null : target;
  }
  if (tab.end + fade > scrollLeft + clientWidth) {
    const target = clamp(tab.end + fade - clientWidth);
    return target === scrollLeft ? null : target;
  }
  return null;
}
