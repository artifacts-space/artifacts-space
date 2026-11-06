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

/** Muted text on the ink backdrop: the kind label above an artifact title. */
export const OG_TEXT_MUTED = "#5ccafc";

/** Artifact titles: a narrower column than the site headline, to leave room for the card. */
export const OG_ARTIFACT_TEXT_WIDTH = 520;
export const OG_TITLE_TYPE = {
  sizes: [56, 48, 42, 36] as const,
  maxHeight: 180,
  lineHeight: 1.06,
  letterSpacingEm: -0.03,
} as const;

/** The synopsis card, styled like the Strata pixel cards: paper fill, ink outline, hard shadow. */
export const OG_CARD = {
  left: 652,
  top: 140,
  width: 476,
  height: 300,
  border: 6,
  shadow: 7,
  padding: 26,
  paper: "#f7f6f4",
  page: "#ffffff",
  ink: "#0a1118",
  shadowColor: "#242a36",
  muted: "#5b6270",
  rule: "#dfe3ea",
  blue: "#0156f6",
  blueMid: "#016af7",
  blueLight: "#5ccafc",
  blueWash: "#e6efff",
} as const;
