import type { ThemeInput } from "./schema";

/**
 * Built-in theme presets. Each is restrained, in the site's soft-minimalism
 * style: near-neutral surfaces with a slight tint, one quiet accent, and a
 * chart palette that fits the tint. Ids are stable kebab-case; artifacts
 * will store them, so never rename one. Every preset passes validation and
 * contrast in both modes (presets.test.ts).
 */

export interface ThemePreset {
  id: string;
  name: string;
  /** One line for the picker and the docs. */
  description: string;
  theme: ThemeInput;
}

/** The site's own categorical series (globals.css): a validated reference palette. */
const reference = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6", "#008300", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9", "#008300", "#e66767"],
};

/** Warm, earthy series for the paper and editorial presets. */
const earth = {
  light: ["oklch(0.55 0.11 45)", "oklch(0.52 0.08 160)", "oklch(0.64 0.12 80)", "oklch(0.5 0.08 250)", "oklch(0.58 0.11 15)", "oklch(0.5 0.07 310)", "oklch(0.62 0.09 120)", "oklch(0.45 0.04 60)"],
  dark: ["oklch(0.72 0.11 45)", "oklch(0.72 0.08 160)", "oklch(0.8 0.11 80)", "oklch(0.72 0.08 250)", "oklch(0.72 0.1 15)", "oklch(0.72 0.07 310)", "oklch(0.78 0.09 120)", "oklch(0.7 0.03 60)"],
};

/** Cool series: blues, teals, and slate, for graphite and ocean. */
const cool = {
  light: ["oklch(0.52 0.13 250)", "oklch(0.6 0.1 195)", "oklch(0.45 0.06 265)", "oklch(0.66 0.11 220)", "oklch(0.55 0.09 165)", "oklch(0.5 0.12 290)", "oklch(0.62 0.03 250)"],
  dark: ["oklch(0.72 0.12 250)", "oklch(0.76 0.1 195)", "oklch(0.68 0.06 265)", "oklch(0.8 0.09 220)", "oklch(0.74 0.09 165)", "oklch(0.72 0.11 290)", "oklch(0.7 0.03 250)"],
};

/** Greens and golds for forest. */
const garden = {
  light: ["oklch(0.5 0.1 150)", "oklch(0.64 0.12 95)", "oklch(0.5 0.07 200)", "oklch(0.58 0.1 55)", "oklch(0.62 0.1 130)", "oklch(0.45 0.05 170)"],
  dark: ["oklch(0.72 0.1 150)", "oklch(0.8 0.11 95)", "oklch(0.72 0.07 200)", "oklch(0.74 0.1 55)", "oklch(0.8 0.1 130)", "oklch(0.66 0.05 170)"],
};

export const themePresets: readonly ThemePreset[] = [
  {
    id: "default",
    name: "Default",
    description: "The site's own look: warm paper and warm near-black, in Geist.",
    theme: {
      version: 1,
      light: {
        background: "oklch(0.985 0.003 85)",
        foreground: "oklch(0.2 0.006 60)",
        mutedForeground: "oklch(0.5 0.01 65)",
        card: "oklch(1 0 0)",
        cardEdge: "oklch(0.2 0.006 60 / 0.09)",
        accent: "oklch(0.2 0.006 60)",
        accentForeground: "oklch(0.985 0.003 85)",
        chart: reference.light,
      },
      dark: {
        background: "oklch(0.165 0.004 60)",
        foreground: "oklch(0.93 0.004 80)",
        mutedForeground: "oklch(0.66 0.008 70)",
        card: "oklch(0.19 0.004 60)",
        cardEdge: "oklch(0.93 0.004 80 / 0.09)",
        accent: "oklch(0.93 0.004 80)",
        accentForeground: "oklch(0.165 0.004 60)",
        chart: reference.dark,
      },
    },
  },
  {
    id: "paper",
    name: "Paper",
    description: "Cream pages, sepia ink, and a sienna accent, in Work Sans.",
    theme: {
      version: 1,
      fonts: { body: "work-sans", heading: "work-sans" },
      light: {
        background: "oklch(0.965 0.014 85)",
        foreground: "oklch(0.26 0.025 60)",
        mutedForeground: "oklch(0.47 0.03 65)",
        card: "oklch(0.985 0.01 85)",
        cardEdge: "oklch(0.26 0.025 60 / 0.1)",
        accent: "oklch(0.47 0.1 45)",
        accentForeground: "oklch(0.985 0.01 85)",
        chart: earth.light,
      },
      dark: {
        background: "oklch(0.2 0.012 65)",
        foreground: "oklch(0.92 0.015 85)",
        mutedForeground: "oklch(0.71 0.02 75)",
        card: "oklch(0.235 0.013 65)",
        cardEdge: "oklch(0.92 0.015 85 / 0.09)",
        accent: "oklch(0.78 0.09 55)",
        accentForeground: "oklch(0.2 0.012 65)",
        chart: earth.dark,
      },
    },
  },
  {
    id: "graphite",
    name: "Graphite",
    description: "Cool neutral greys and slate, set in IBM Plex Sans and Plex Mono.",
    theme: {
      version: 1,
      fonts: { body: "ibm-plex-sans", heading: "ibm-plex-sans", mono: "ibm-plex-mono" },
      light: {
        background: "oklch(0.975 0.003 250)",
        foreground: "oklch(0.22 0.01 255)",
        mutedForeground: "oklch(0.48 0.015 255)",
        card: "oklch(1 0 0)",
        cardEdge: "oklch(0.22 0.01 255 / 0.09)",
        accent: "oklch(0.32 0.02 255)",
        accentForeground: "oklch(0.98 0.003 250)",
        chart: cool.light,
      },
      dark: {
        background: "oklch(0.17 0.006 255)",
        foreground: "oklch(0.93 0.005 250)",
        mutedForeground: "oklch(0.69 0.012 255)",
        card: "oklch(0.205 0.007 255)",
        cardEdge: "oklch(0.93 0.005 250 / 0.09)",
        accent: "oklch(0.88 0.01 250)",
        accentForeground: "oklch(0.18 0.006 255)",
        chart: cool.dark,
      },
    },
  },
  {
    id: "ink",
    name: "Ink",
    description: "Pure white and true black for the highest contrast, in Inter and JetBrains Mono.",
    theme: {
      version: 1,
      radius: "sm",
      fonts: { body: "inter", heading: "inter", mono: "jetbrains-mono" },
      light: {
        background: "oklch(1 0 0)",
        foreground: "oklch(0.13 0 0)",
        mutedForeground: "oklch(0.4 0 0)",
        card: "oklch(1 0 0)",
        cardEdge: "oklch(0.13 0 0 / 0.16)",
        accent: "oklch(0.13 0 0)",
        accentForeground: "oklch(1 0 0)",
        chart: reference.light,
      },
      dark: {
        background: "oklch(0.1 0 0)",
        foreground: "oklch(0.98 0 0)",
        mutedForeground: "oklch(0.78 0 0)",
        card: "oklch(0.14 0 0)",
        cardEdge: "oklch(0.98 0 0 / 0.16)",
        accent: "oklch(0.98 0 0)",
        accentForeground: "oklch(0.1 0 0)",
        chart: reference.dark,
      },
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Faint sea-blue surfaces and a deep blue accent, in DM Sans.",
    theme: {
      version: 1,
      radius: "lg",
      fonts: { body: "dm-sans", heading: "dm-sans" },
      light: {
        background: "oklch(0.975 0.008 230)",
        foreground: "oklch(0.24 0.03 245)",
        mutedForeground: "oklch(0.47 0.035 240)",
        card: "oklch(0.995 0.003 230)",
        cardEdge: "oklch(0.24 0.03 245 / 0.1)",
        accent: "oklch(0.48 0.11 240)",
        accentForeground: "oklch(0.985 0.005 230)",
        chart: cool.light,
      },
      dark: {
        background: "oklch(0.18 0.02 245)",
        foreground: "oklch(0.93 0.012 230)",
        mutedForeground: "oklch(0.71 0.03 235)",
        card: "oklch(0.215 0.022 245)",
        cardEdge: "oklch(0.93 0.012 230 / 0.1)",
        accent: "oklch(0.76 0.1 230)",
        accentForeground: "oklch(0.18 0.02 245)",
        chart: cool.dark,
      },
    },
  },
  {
    id: "forest",
    name: "Forest",
    description: "Soft sage surfaces and a moss accent, in Manrope.",
    theme: {
      version: 1,
      radius: "lg",
      fonts: { body: "manrope", heading: "manrope" },
      light: {
        background: "oklch(0.972 0.01 140)",
        foreground: "oklch(0.25 0.03 150)",
        mutedForeground: "oklch(0.46 0.035 150)",
        card: "oklch(0.993 0.004 140)",
        cardEdge: "oklch(0.25 0.03 150 / 0.1)",
        accent: "oklch(0.45 0.08 155)",
        accentForeground: "oklch(0.985 0.008 140)",
        chart: garden.light,
      },
      dark: {
        background: "oklch(0.185 0.015 155)",
        foreground: "oklch(0.92 0.015 140)",
        mutedForeground: "oklch(0.71 0.03 145)",
        card: "oklch(0.22 0.017 155)",
        cardEdge: "oklch(0.92 0.015 140 / 0.1)",
        accent: "oklch(0.77 0.09 150)",
        accentForeground: "oklch(0.18 0.015 155)",
        chart: garden.dark,
      },
    },
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "A reading page: Instrument Serif headings over Source Serif 4 body text, with an oxblood accent.",
    theme: {
      version: 1,
      radius: "sm",
      fonts: { body: "source-serif-4", heading: "instrument-serif" },
      light: {
        background: "oklch(0.982 0.006 85)",
        foreground: "oklch(0.21 0.01 60)",
        mutedForeground: "oklch(0.46 0.012 60)",
        card: "oklch(0.997 0.002 85)",
        cardEdge: "oklch(0.21 0.01 60 / 0.09)",
        accent: "oklch(0.43 0.12 25)",
        accentForeground: "oklch(0.985 0.004 85)",
        chart: earth.light,
      },
      dark: {
        background: "oklch(0.17 0.005 60)",
        foreground: "oklch(0.93 0.008 85)",
        mutedForeground: "oklch(0.71 0.012 75)",
        card: "oklch(0.2 0.006 60)",
        cardEdge: "oklch(0.93 0.008 85 / 0.09)",
        accent: "oklch(0.76 0.1 25)",
        accentForeground: "oklch(0.17 0.005 60)",
        chart: earth.dark,
      },
    },
  },
  {
    id: "classic",
    name: "Classic",
    description: "Familiar and clear: Roboto with JetBrains Mono, cool greys, and a blue accent.",
    theme: {
      version: 1,
      radius: "lg",
      fonts: { body: "roboto", heading: "roboto", mono: "jetbrains-mono" },
      light: {
        background: "oklch(0.98 0.002 250)",
        foreground: "oklch(0.23 0.005 250)",
        mutedForeground: "oklch(0.48 0.01 250)",
        card: "oklch(1 0 0)",
        cardEdge: "oklch(0.23 0.005 250 / 0.1)",
        accent: "oklch(0.5 0.15 255)",
        accentForeground: "oklch(0.99 0 0)",
        chart: reference.light,
      },
      dark: {
        background: "oklch(0.17 0.004 250)",
        foreground: "oklch(0.94 0.003 250)",
        mutedForeground: "oklch(0.7 0.01 250)",
        card: "oklch(0.21 0.005 250)",
        cardEdge: "oklch(0.94 0.003 250 / 0.1)",
        accent: "oklch(0.73 0.12 255)",
        accentForeground: "oklch(0.17 0.004 250)",
        chart: reference.dark,
      },
    },
  },
];

/** The id of the site default theme. */
export const DEFAULT_THEME_ID = "default";
