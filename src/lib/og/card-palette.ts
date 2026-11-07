import { formatHex, mixOklch, parseColor, type Oklch } from "@/lib/themes/color";
import type { Theme } from "@/lib/themes/schema";
import { usesSitePalette } from "@/lib/themes/style";

import { OG_CARD } from "./theme";

/**
 * The synopsis card's colors. The site look is the Strata pixel card in
 * OG_CARD; an artifact with its own theme draws the card in that theme's
 * light palette instead. Satori cannot read oklch() or CSS custom
 * properties, so theme colors are converted to hex here. Theme fonts are not
 * used: Satori reads TTF/OTF/WOFF, and theme faces are vendored as woff2.
 */
export interface OgCardPalette {
  paper: string;
  page: string;
  ink: string;
  shadowColor: string;
  muted: string;
  rule: string;
  blue: string;
  blueMid: string;
  blueLight: string;
  blueWash: string;
}

/** The site's own card colors. */
export const siteCardPalette: OgCardPalette = {
  paper: OG_CARD.paper,
  page: OG_CARD.page,
  ink: OG_CARD.ink,
  shadowColor: OG_CARD.shadowColor,
  muted: OG_CARD.muted,
  rule: OG_CARD.rule,
  blue: OG_CARD.blue,
  blueMid: OG_CARD.blueMid,
  blueLight: OG_CARD.blueLight,
  blueWash: OG_CARD.blueWash,
};

const black: Oklch = { l: 0, c: 0, h: 0, alpha: 1 };

/**
 * The card colors for a theme: the site card when there is no theme or it
 * uses the site palette, else the theme's light palette (card, page, text,
 * accent, and the first chart colors). Falls back to the site card if a
 * color does not parse, which a validated theme never does.
 */
export function ogCardPalette(theme: Theme | null): OgCardPalette {
  if (!theme || usesSitePalette(theme)) return siteCardPalette;
  const { light } = theme;
  const card = parseColor(light.card);
  const background = parseColor(light.background);
  const foreground = parseColor(light.foreground);
  const muted = parseColor(light.mutedForeground);
  const accent = parseColor(light.accent);
  if (!card || !background || !foreground || !muted || !accent) return siteCardPalette;
  const chart = (index: number) => parseColor(light.chart[index] ?? light.accent) ?? accent;
  return {
    paper: formatHex(card),
    page: formatHex(background),
    ink: formatHex(foreground),
    shadowColor: formatHex(mixOklch(foreground, black, 0.25)),
    muted: formatHex(muted),
    rule: formatHex(mixOklch(card, foreground, 0.12)),
    blue: formatHex(accent),
    blueMid: formatHex(chart(0)),
    blueLight: formatHex(chart(1)),
    blueWash: formatHex(mixOklch(card, accent, 0.12)),
  };
}
