/*
 * Colors and type for social preview images. Satori cannot read CSS custom
 * properties, so these mirror the dark theme tokens in src/app/globals.css as
 * literal values. Change them together.
 */

/** Headline and wordmark text on the ink backdrop. */
export const OG_TEXT = "#f5f3ef";

export const OG_SIZE = { width: 1200, height: 630 } as const;

/** The text column: left edge, width, and vertical nudge from the Strata Ink layout. */
export const OG_TEXT_BOX = { left: 72, width: 540, paddingBottom: 40, gap: 30 } as const;

export const OG_WORDMARK_TYPE = { fontSize: 32, letterSpacingEm: -0.01, iconSize: 40, gap: 12 } as const;

/**
 * Headline type. `maxHeight` holds three lines at 64px (or four at 52px and
 * below), which keeps the block clear of the pixel band at the bottom.
 */
export const OG_HEADLINE_TYPE = {
  sizes: [64, 56, 52, 46] as const,
  maxHeight: 220,
  lineHeight: 1.04,
  letterSpacingEm: -0.035,
} as const;
