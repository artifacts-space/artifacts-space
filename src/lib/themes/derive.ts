import { ensureContrast, formatOklch, mixOklch, parseColor, type Oklch } from "./color";
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
    // Declared from --code-foreground in globals.css, which resolves where it is declared, so it is set here too.
    "--syntax-plain": colors.foreground,
    ...syntaxTokens(mode, code),
  };
}

function seriesTokens(colors: ThemeColors): Record<string, string> {
  const { chart } = colors;
  return Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`--series-${String(index + 1)}`, chart[index % chart.length] ?? colors.foreground]));
}

/** Every CSS token a palette sets, keyed by custom property name, with canonical color values. */
export function paletteTokens(mode: PaletteMode, colors: ThemeColors): Record<string, string> {
  return { ...surfaceTokens(colors), ...codeTokens(mode, colors), ...seriesTokens(colors) };
}
