import { contrastRatio, ensureContrast, formatOklch, mixOklch, parseColor, relativeLuminance, type Oklch } from "./color";
import type { ThemeColors } from "./schema";

/**
 * Turns a theme palette into the site's CSS tokens (the names in
 * src/app/globals.css), so every artifact component picks the theme up
 * without changes. Seven colors and a chart palette become the full set:
 * quiet surfaces are mixes of the foreground into the card, code syntax
 * colors keep the site's hues but are re-lit to stay readable on the themed
 * code surface, and the chart palette fills the eight series tokens.
 */

export type PaletteMode = "light" | "dark";

/** The site's code syntax colors per mode, from globals.css. Hue and chroma are kept; lightness is adjusted for contrast. */
const siteSyntax: Record<PaletteMode, Record<SyntaxRole, string>> = {
  light: {
    keyword: "oklch(0.53 0.19 355)",
    string: "oklch(0.5 0.12 150)",
    function: "oklch(0.5 0.19 295)",
    property: "oklch(0.5 0.14 250)",
    number: "oklch(0.56 0.14 60)",
    comment: "oklch(0.6 0.008 65)",
    punctuation: "oklch(0.52 0.008 65)",
    inserted: "oklch(0.5 0.12 150)",
    deleted: "oklch(0.55 0.18 27)",
  },
  dark: {
    keyword: "oklch(0.76 0.14 355)",
    string: "oklch(0.78 0.12 150)",
    function: "oklch(0.77 0.12 295)",
    property: "oklch(0.77 0.1 245)",
    number: "oklch(0.81 0.11 70)",
    comment: "oklch(0.58 0.008 70)",
    punctuation: "oklch(0.66 0.008 70)",
    inserted: "oklch(0.78 0.12 150)",
    deleted: "oklch(0.72 0.14 25)",
  },
};

const syntaxRoles = ["keyword", "string", "function", "property", "number", "comment", "punctuation", "inserted", "deleted"] as const;
type SyntaxRole = (typeof syntaxRoles)[number];

/** Comments and punctuation are quieter by design: 3:1. Everything else in code is text: 4.5:1. */
export const syntaxMinimum: Record<SyntaxRole, number> = {
  keyword: 4.5,
  string: 4.5,
  function: 4.5,
  property: 4.5,
  number: 4.5,
  comment: 3,
  punctuation: 3,
  inserted: 4.5,
  deleted: 4.5,
};

const black: Oklch = { l: 0, c: 0, h: 0, alpha: 1 };

function read(value: string): Oklch {
  return parseColor(value) ?? black;
}

const withAlpha = (color: Oklch, alpha: number): Oklch => ({ ...color, alpha });

/** Syntax token colors re-lit until each meets its minimum on `code`. */
export function syntaxTokens(mode: PaletteMode, code: Oklch): Record<string, string> {
  return Object.fromEntries(
    syntaxRoles.map((role) => [`--syntax-${role}`, formatOklch(ensureContrast(read(siteSyntax[mode][role]), code, syntaxMinimum[role] + 0.05))]),
  );
}

function surfaceTokens(colors: ThemeColors): Record<string, string> {
  const fg = read(colors.foreground);
  const card = read(colors.card);
  const toward = (amount: number) => formatOklch(mixOklch(card, fg, amount));
  return {
    "--background": colors.background,
    "--foreground": colors.foreground,
    "--card": colors.card,
    "--card-foreground": colors.foreground,
    "--card-edge": colors.cardEdge,
    "--popover": colors.card,
    "--popover-foreground": colors.foreground,
    "--primary": colors.accent,
    "--primary-foreground": colors.accentForeground,
    "--secondary": toward(0.06),
    "--secondary-foreground": colors.foreground,
    "--muted": toward(0.045),
    "--muted-foreground": colors.mutedForeground,
    "--accent": toward(0.07),
    "--accent-foreground": colors.foreground,
    "--border": formatOklch(withAlpha(fg, 0.11)),
    "--input": formatOklch(withAlpha(fg, 0.15)),
    "--diagram-stroke": toward(0.25),
    "--diagram-line": toward(0.48),
  };
}

function codeTokens(mode: PaletteMode, colors: ThemeColors): Record<string, string> {
  const code = mixOklch(read(colors.card), read(colors.background), 0.25);
  return {
    "--code": formatOklch(code),
    "--code-foreground": colors.foreground,
    "--code-border": colors.cardEdge,
    // Inline code in running text: the card a step toward the ink, like --accent.
    "--code-inline": formatOklch(mixOklch(read(colors.card), read(colors.foreground), 0.07)),
    // Declared from --code-foreground in globals.css, which resolves where it is declared, so it is set here too.
    "--syntax-plain": colors.foreground,
    ...syntaxTokens(mode, code),
  };
}

function seriesTokens(colors: ThemeColors): Record<string, string> {
  const { chart } = colors;
  return Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`--series-${String(index + 1)}`, chart[index % chart.length] ?? colors.foreground]));
}

/** The site's @mention chip ink per mode, from globals.css: people, and agents in a slightly different hue. */
const siteMentionInk: Record<PaletteMode, { person: string; agent: string }> = {
  light: { person: "oklch(0.42 0.13 262)", agent: "oklch(0.42 0.13 300)" },
  dark: { person: "oklch(0.86 0.08 262)", agent: "oklch(0.86 0.08 300)" },
};

/** How far a chip's background leans from the card toward its ink: a quiet tint, a little stronger on dark cards. */
const mentionTint: Record<PaletteMode, number> = { light: 0.1, dark: 0.15 };

/**
 * @mention chip colors on the themed card: the site's hues, a tint of the
 * card for the chip, and the ink re-lit until it reads at 4.5:1 on it.
 */
export function mentionTokens(mode: PaletteMode, colors: ThemeColors): Record<string, string> {
  const card = read(colors.card);
  const chip = (ink: string, prefix: string): Record<string, string> => {
    const background = mixOklch(card, read(ink), mentionTint[mode]);
    return { [prefix]: formatOklch(background), [`${prefix}-foreground`]: formatOklch(ensureContrast(read(ink), background, 4.55)) };
  };
  return { ...chip(siteMentionInk[mode].person, "--mention"), ...chip(siteMentionInk[mode].agent, "--mention-agent") };
}

/** The site's switch colors per mode, from globals.css: the on track and both thumbs. */
const siteSwitch: Record<PaletteMode, { on: string; onThumb: string; offThumb: string }> = {
  light: { on: "oklch(0.56 0.15 150)", onThumb: "oklch(1 0 0)", offThumb: "oklch(0.56 0.008 65)" },
  dark: { on: "oklch(0.63 0.17 150)", onThumb: "oklch(1 0 0)", offThumb: "oklch(0.6 0.008 70)" },
};

/** How far the off track leans from the card toward the ink: a quiet well that still reads as a control. */
const switchOffTint = 0.08;

/** Non-text UI needs 3:1 (WCAG 1.4.11); the small margin keeps rounding from dipping under it. */
const switchMinimum = 3.05;

/**
 * The hover tints in src/components/ui/switch.tsx; keep them in step. The on
 * track mixes 10% toward the ink in light and toward the page in dark (it
 * deepens in both), and the off track mixes 6% toward the ink.
 */
const switchOnHover = 0.1;
const switchOffHover = 0.06;

/** Moves `color`'s lightness away from `background` until `passes` holds, like ensureContrast but for a test across several states. */
function holdApart(color: Oklch, background: Oklch, passes: (candidate: Oklch) => boolean): Oklch {
  const direction = relativeLuminance(background) > 0.18 ? -1 : 1;
  let candidate = color;
  for (let step = 0; step < 200 && !passes(candidate); step += 1) {
    candidate = { ...candidate, l: Math.min(1, Math.max(0, candidate.l + direction * 0.005)) };
  }
  return candidate;
}

/**
 * Switch colors on the themed card: the site's green re-lit until the on
 * track reads at 3:1 on the card, at rest and hovered; the off track a tint
 * of the card; and each thumb re-lit until it reads at 3:1 on its own track,
 * at rest and hovered.
 */
export function switchTokens(mode: PaletteMode, colors: ThemeColors): Record<string, string> {
  const card = read(colors.card);
  const ink = read(colors.foreground);
  const site = siteSwitch[mode];
  const deepen = (track: Oklch) => mixOklch(track, mode === "light" ? ink : read(colors.background), switchOnHover);
  const on = holdApart(read(site.on), card, (track) => [track, deepen(track)].every((state) => contrastRatio(state, card) >= switchMinimum));
  const off = mixOklch(card, ink, switchOffTint);
  const onTracks = [on, deepen(on)];
  const offHover = mixOklch(off, ink, switchOffHover);
  const offTracks = [off, offHover];
  const readsOn = (tracks: Oklch[]) => (thumb: Oklch) => tracks.every((track) => contrastRatio(thumb, track) >= switchMinimum);
  return {
    "--switch-on": formatOklch(on),
    "--switch-on-thumb": formatOklch(holdApart(read(site.onThumb), on, readsOn(onTracks))),
    "--switch-off": formatOklch(off),
    "--switch-off-thumb": formatOklch(holdApart(read(site.offThumb), offHover, readsOn(offTracks))),
  };
}

/** Every CSS token a palette sets, keyed by custom property name, with canonical color values. */
export function paletteTokens(mode: PaletteMode, colors: ThemeColors): Record<string, string> {
  return { ...surfaceTokens(colors), ...codeTokens(mode, colors), ...seriesTokens(colors), ...mentionTokens(mode, colors), ...switchTokens(mode, colors) };
}
