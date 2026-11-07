import { z } from "zod";

import { parseColor, formatOklch } from "./color";
import { contrastIssues } from "./contrast";
import { fontIdsFor, themeFont, type FontRole, type ThemeFontId } from "./fonts";

/**
 * The theme token model, version 1. A theme holds colors and a chart palette
 * for light and for dark, plus a radius step, three font slots, and an
 * optional mode lock. Radius and fonts are shared by both modes, so text
 * never reflows when a reader switches between light and dark.
 */

export const themeModes = ["auto", "light", "dark"] as const;
export type ThemeMode = (typeof themeModes)[number];

/** The radius steps and the `--radius` each sets. Cards use 1.4× and controls 1× of it, as on the site. */
export const radiusScale = { none: "0rem", sm: "0.25rem", md: "0.375rem", lg: "0.5rem", xl: "0.625rem" } as const;
export type RadiusStep = keyof typeof radiusScale;
const radiusSteps = Object.keys(radiusScale) as [RadiusStep, ...RadiusStep[]];

/** The color keys of each palette, in documentation order. */
export const themeColorKeys = ["background", "foreground", "mutedForeground", "card", "cardEdge", "accent", "accentForeground"] as const;
export type ThemeColorKey = (typeof themeColorKeys)[number];

export const CHART_MIN = 6;
export const CHART_MAX = 8;

/** One palette: every color as a canonical `oklch()` string. */
export type ThemeColors = Record<ThemeColorKey, string> & { chart: string[] };

/** A validated, normalised theme. */
export interface Theme {
  version: 1;
  mode: ThemeMode;
  radius: RadiusStep;
  fonts: { body: ThemeFontId; heading: ThemeFontId; mono: ThemeFontId };
  light: ThemeColors;
  dark: ThemeColors;
}

/** One problem with a theme, with the dotted path of the value at fault. */
export interface ThemeIssue {
  path: string;
  message: string;
}

/** Text that is never part of a color and suggests an attempt to smuggle CSS. Checked first for a clearer message. */
const forbidden = /url\(|var\(|expression|;|\}|\{|\/\*|\*\/|\\|@|<|>/i;

const colorMessage = "must be a hex, rgb(), hsl(), or oklch() color";

function colorSchema({ allowAlpha }: { allowAlpha: boolean }) {
  return z.string().max(64, "is too long for a color").transform((value, ctx) => {
    if (forbidden.test(value)) {
      ctx.addIssue({ code: "custom", message: `${colorMessage}; url(), var(), expression(), comments, braces, and ";" are not allowed` });
      return z.NEVER;
    }
    const color = parseColor(value);
    if (!color) {
      ctx.addIssue({ code: "custom", message: colorMessage });
      return z.NEVER;
    }
    if (!allowAlpha && color.alpha < 1) {
      ctx.addIssue({ code: "custom", message: "must be opaque (no alpha); only cardEdge may be transparent" });
      return z.NEVER;
    }
    return formatOklch(color);
  });
}

const opaque = colorSchema({ allowAlpha: false });

const paletteSchema = z.strictObject({
  background: opaque,
  foreground: opaque,
  mutedForeground: opaque,
  card: opaque,
  cardEdge: colorSchema({ allowAlpha: true }),
  accent: opaque,
  accentForeground: opaque,
  chart: z.array(opaque).min(CHART_MIN, `needs ${String(CHART_MIN)} to ${String(CHART_MAX)} colors`).max(CHART_MAX, `needs ${String(CHART_MIN)} to ${String(CHART_MAX)} colors`),
});

const slotHints: Record<FontRole, string> = {
  body: "Display faces (Instrument Serif, Fraunces) are for headings only.",
  heading: "Mono faces are for code only.",
  mono: "Only mono faces can set code.",
};

function fontSlot(role: FontRole, fallback: ThemeFontId) {
  const allowed = fontIdsFor(role);
  return z
    .string()
    .default(fallback)
    .transform((id, ctx) => {
      const font = themeFont(id);
      const match = allowed.find((item) => item === id);
      if (font && match) return match;
      const reason = font ? `${font.family} cannot be the ${role} font. ${slotHints[role]}` : `"${id.slice(0, 40)}" is not an allowed font.`;
      ctx.addIssue({ code: "custom", message: `${reason} Pick one of: ${allowed.join(", ")}.` });
      return z.NEVER;
    });
}

const defaultFonts = { body: "geist-sans", heading: "geist-sans", mono: "geist-mono" } as const;

/** The zod schema for theme JSON. Known keys only; colors are parsed and normalised; contrast is checked in both modes. */
export const themeSchema = z
  .strictObject({
    version: z.literal(1),
    mode: z.enum(themeModes).default("auto"),
    radius: z.enum(radiusSteps).default("md"),
    fonts: z
      .strictObject({
        body: fontSlot("body", defaultFonts.body),
        heading: fontSlot("heading", defaultFonts.heading),
        mono: fontSlot("mono", defaultFonts.mono),
      })
      .default(defaultFonts),
    light: paletteSchema,
    dark: paletteSchema,
  })
  .superRefine((theme, ctx) => {
    for (const issue of contrastIssues(theme)) {
      ctx.addIssue({ code: "custom", path: issue.path.split("."), message: issue.message });
    }
  });

/** Theme JSON as an author writes it: colors in any accepted syntax, optional fields left out. */
export type ThemeInput = z.input<typeof themeSchema>;

export type ParseThemeResult = { ok: true; theme: Theme } | { ok: false; issues: ThemeIssue[] };

/**
 * Validates theme JSON. Returns the normalised theme, or every problem with
 * its path, such as `dark.mutedForeground` or `fonts.body`. Low contrast is
 * rejected, never silently adjusted; see `autofixContrast` for suggestions.
 */
export function parseTheme(input: unknown): ParseThemeResult {
  const result = themeSchema.safeParse(input);
  if (result.success) return { ok: true, theme: result.data };
  const issues = result.error.issues.map((issue) => ({ path: issue.path.map(String).join(".") || "(theme)", message: issue.message }));
  return { ok: false, issues };
}
