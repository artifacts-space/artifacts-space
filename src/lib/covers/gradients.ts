import { formatHex, mixOklab, parseColor } from "@/lib/themes/color";
import type { ThemeColors } from "@/lib/themes/schema";

/**
 * Cover gradients: a small, curated set built only from theme tokens. Each
 * end is a soft tint, a small share of one token mixed into the page
 * background, so a cover follows the artifact's theme and the reader's light
 * or dark choice, and never turns garish. The same recipe renders as CSS on
 * the page (custom properties, `color-mix` in OKLab) and as plain hex colors
 * in social preview images, which cannot read either.
 */

/** Tokens a gradient may tint the background with. Series 1 to 6 exist in every theme (charts need 6 to 8). */
export const coverTokens = ["foreground", "series-1", "series-2", "series-3", "series-4", "series-5", "series-6"] as const;
export type CoverToken = (typeof coverTokens)[number];

/** One end of a gradient: `amount` percent of `token` mixed into the background. */
export interface CoverStop {
  token: CoverToken;
  amount: number;
}

/** A curated cover gradient. */
export interface CoverGradient {
  id: string;
  name: string;
  /** CSS gradient angle in degrees. */
  angle: number;
  from: CoverStop;
  to: CoverStop;
}

export const coverGradients = [
  { id: "stone", name: "Stone", angle: 160, from: { token: "foreground", amount: 9 }, to: { token: "foreground", amount: 3 } },
  { id: "mist", name: "Mist", angle: 160, from: { token: "series-1", amount: 14 }, to: { token: "series-6", amount: 8 } },
  { id: "tide", name: "Tide", angle: 135, from: { token: "series-1", amount: 22 }, to: { token: "series-3", amount: 12 } },
  { id: "meadow", name: "Meadow", angle: 135, from: { token: "series-3", amount: 20 }, to: { token: "series-4", amount: 12 } },
  { id: "dawn", name: "Dawn", angle: 120, from: { token: "series-2", amount: 18 }, to: { token: "series-5", amount: 14 } },
  { id: "ember", name: "Ember", angle: 120, from: { token: "series-4", amount: 20 }, to: { token: "series-2", amount: 14 } },
  { id: "bloom", name: "Bloom", angle: 150, from: { token: "series-5", amount: 18 }, to: { token: "series-6", amount: 12 } },
  { id: "dusk", name: "Dusk", angle: 150, from: { token: "series-6", amount: 20 }, to: { token: "series-1", amount: 12 } },
] as const satisfies readonly CoverGradient[];

export type CoverGradientId = (typeof coverGradients)[number]["id"];

const byId: ReadonlyMap<string, CoverGradient> = new Map(coverGradients.map((gradient) => [gradient.id, gradient]));

/** The gradient with this id, or undefined. */
export function coverGradient(id: string): CoverGradient | undefined {
  return byId.get(id);
}

/** The gradient ids, comma-separated, for messages and field descriptions. */
export function coverGradientIdList(): string {
  return coverGradients.map((gradient) => gradient.id).join(", ");
}

function cssStop({ token, amount }: CoverStop): string {
  return `color-mix(in oklab, var(--${token}) ${String(amount)}%, var(--background))`;
}

/**
 * The gradient as a CSS `background-image` value, made only of theme custom
 * properties. Render it inside a ThemeScope so it takes the artifact's theme.
 */
export function coverGradientCss(gradient: CoverGradient): string {
  return `linear-gradient(${String(gradient.angle)}deg, ${cssStop(gradient.from)}, ${cssStop(gradient.to)})`;
}

function paletteColor(palette: ThemeColors, token: CoverToken): string {
  if (token === "foreground") return palette.foreground;
  const index = Number(token.slice("series-".length)) - 1;
  return palette.chart[index % palette.chart.length] ?? palette.foreground;
}

function hexStop(palette: ThemeColors, stop: CoverStop): string | null {
  const background = parseColor(palette.background);
  const tint = parseColor(paletteColor(palette, stop.token));
  if (!background || !tint) return null;
  return formatHex(mixOklab(background, tint, stop.amount / 100));
}

/**
 * The gradient in one palette as plain hex colors, for social preview
 * images. Null when a color does not parse, which a validated theme never does.
 */
export function coverGradientHex(gradient: CoverGradient, palette: ThemeColors): { angle: number; from: string; to: string } | null {
  const from = hexStop(palette, gradient.from);
  const to = hexStop(palette, gradient.to);
  return from && to ? { angle: gradient.angle, from, to } : null;
}
