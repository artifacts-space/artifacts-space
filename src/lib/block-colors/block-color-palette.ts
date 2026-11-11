import type { BlockHue } from "./block-color-rules";

/** One hue's pair of tokens: the text color and the background fill. */
export interface BlockHueTokens {
  text: string;
  fill: string;
}

/**
 * The site's block color tokens, `--block-<hue>` and `--block-<hue>-bg` in
 * globals.css, per mode (block-color-tokens.test.ts checks they match).
 * Themes start from these and re-light them for their own surfaces
 * (`blockColorTokens` in src/lib/themes/derive.ts).
 */
export const siteBlockColors: Readonly<Record<"light" | "dark", Readonly<Record<BlockHue, BlockHueTokens>>>> = {
  light: {
    gray: { text: "oklch(0.52 0.01 65)", fill: "oklch(0.94 0.004 80)" },
    brown: { text: "oklch(0.5 0.06 55)", fill: "oklch(0.94 0.02 60)" },
    orange: { text: "oklch(0.53 0.15 50)", fill: "oklch(0.95 0.04 60)" },
    yellow: { text: "oklch(0.52 0.13 85)", fill: "oklch(0.96 0.05 95)" },
    green: { text: "oklch(0.51 0.12 150)", fill: "oklch(0.95 0.035 155)" },
    blue: { text: "oklch(0.52 0.15 255)", fill: "oklch(0.95 0.03 250)" },
    purple: { text: "oklch(0.52 0.16 300)", fill: "oklch(0.95 0.03 305)" },
    pink: { text: "oklch(0.54 0.17 350)", fill: "oklch(0.95 0.03 350)" },
    red: { text: "oklch(0.54 0.19 27)", fill: "oklch(0.95 0.03 25)" },
  },
  dark: {
    gray: { text: "oklch(0.7 0.01 70)", fill: "oklch(0.26 0.005 60)" },
    brown: { text: "oklch(0.7 0.06 60)", fill: "oklch(0.27 0.02 55)" },
    orange: { text: "oklch(0.74 0.13 55)", fill: "oklch(0.28 0.04 50)" },
    yellow: { text: "oklch(0.8 0.12 90)", fill: "oklch(0.29 0.04 90)" },
    green: { text: "oklch(0.74 0.12 150)", fill: "oklch(0.27 0.035 155)" },
    blue: { text: "oklch(0.74 0.12 255)", fill: "oklch(0.27 0.04 255)" },
    purple: { text: "oklch(0.74 0.13 300)", fill: "oklch(0.28 0.04 305)" },
    pink: { text: "oklch(0.75 0.13 350)", fill: "oklch(0.28 0.04 350)" },
    red: { text: "oklch(0.72 0.15 27)", fill: "oklch(0.28 0.05 25)" },
  },
};
