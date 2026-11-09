import { parseTheme, type Theme, type ThemeInput } from "@/lib/themes/schema";

const chart = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6"];

/**
 * A valid custom theme, locked to light, whose card sits near the lightest a
 * light palette may be and is tinted toward the brand hue. The site's blue
 * focus ring reads at about 2.4:1 on it, so the gallery's focus specimen shows
 * the derived ring doing its job. Not a preset: it exists only for the gallery.
 */
export const focusThemeInput: ThemeInput = {
  version: 1,
  mode: "light",
  light: {
    background: "oklch(0.74 0.04 262)",
    foreground: "oklch(0.15 0.01 262)",
    mutedForeground: "oklch(0.3 0.02 262)",
    card: "oklch(0.72 0.05 262)",
    cardEdge: "oklch(0.15 0.01 262 / 0.12)",
    accent: "oklch(0.3 0.08 262)",
    accentForeground: "oklch(0.98 0 0)",
    chart,
  },
  dark: {
    background: "oklch(0.165 0.004 60)",
    foreground: "oklch(0.93 0.004 80)",
    mutedForeground: "oklch(0.66 0.008 70)",
    card: "oklch(0.19 0.004 60)",
    cardEdge: "oklch(0.93 0.004 80 / 0.09)",
    accent: "oklch(0.93 0.004 80)",
    accentForeground: "oklch(0.165 0.004 60)",
    chart,
  },
};

/** The fixture as a validated theme. Throws when it stops validating, so the specimen never silently falls back. */
export function focusTheme(): Theme {
  const result = parseTheme(focusThemeInput);
  if (!result.ok) throw new Error(`Focus theme fixture is invalid: ${result.issues.map((issue) => issue.message).join("; ")}`);
  return result.theme;
}
