import { themesListResult } from "@/lib/mcp/theme-tools";
import { artifactThemeLimits } from "@/lib/themes/artifact-theme-limits";
import { parseArtifactThemeInput } from "@/lib/themes/artifact-theme";
import { themePresets } from "@/lib/themes/presets";
import { CHART_MAX, CHART_MIN, radiusScale, themeModes, type ThemeInput } from "@/lib/themes/schema";

/**
 * Examples and tables for the themes docs page. Kept here so tests can prove
 * that every example is what the server really accepts or refuses, and that
 * the error message on the page is the real one.
 */

const exampleId = "Vq3kJ0pXw2mZ8rT5yN1aBc";
const quoted = (values: readonly string[]) => values.map((value) => `"${value}"`).join(" | ");

function presetInput(id: string): ThemeInput {
  const preset = themePresets.find((item) => item.id === id);
  if (!preset) throw new Error(`Theme preset "${id}" is missing.`);
  return preset.theme;
}

const classic = presetInput("classic");

/** A custom theme: Classic's greys with a teal accent, Inter, and square corners. It passes validation. */
export const customThemeExample = {
  version: 1,
  mode: "auto",
  radius: "sm",
  fonts: { body: "inter", heading: "inter", mono: "jetbrains-mono" },
  light: { ...classic.light, accent: "#0f766e", accentForeground: "#ffffff" },
  dark: { ...classic.dark, accent: "#5eead4", accentForeground: "#042f2e" },
} satisfies ThemeInput;

/** The Classic preset written out as theme JSON, for the full-theme example. */
export const classicThemeJson = JSON.stringify({ ...classic, mode: "auto" }, null, 2);

/** Ready-to-copy MCP calls: a preset on create, theme JSON on update, and removing the theme. */
export const themeMcpExamples = {
  createWithPreset: JSON.stringify(
    { name: "artifacts_create", arguments: { title: "Q3 launch plan", kind: "markdown", content: "# Q3 launch plan\n\n…", theme: "paper" } },
    null,
    2,
  ),
  updateWithJson: JSON.stringify({ name: "artifacts_update", arguments: { id: exampleId, theme: customThemeExample } }, null, 2),
  clear: JSON.stringify({ name: "artifacts_update", arguments: { id: exampleId, theme: null } }, null, 2),
};

/** What themes_list returns, with the preset list cut to its first two entries. */
export function themesListExample(): string {
  const result = themesListResult();
  return JSON.stringify({ ...result, presets: [...result.presets.slice(0, 2), `…${String(result.presets.length - 2)} more`] }, null, 2);
}

/** Classic with secondary text too faint in both palettes, so it fails contrast. */
export const lowContrastTheme = {
  ...classic,
  light: { ...classic.light, mutedForeground: "#9ca3af" },
  dark: { ...classic.dark, mutedForeground: "#4b5563" },
} satisfies ThemeInput;

/** The real error an agent gets for `lowContrastTheme`. Throws if the theme is ever accepted, so the docs cannot show a stale message. */
export function lowContrastMessage(): string {
  const result = parseArtifactThemeInput(lowContrastTheme);
  if (result.ok) throw new Error("The low-contrast docs example passed validation. Make it fail again.");
  return result.message;
}

/** The top-level keys of theme JSON: key, type, and rule. */
export const themeFieldRows: [string, string, string][] = [
  ["version", "1", "Required. Always 1."],
  ["light", "palette", "Required. The colors for light mode. See Colors."],
  ["dark", "palette", "Required. The colors for dark mode, with the same keys."],
  ["radius", quoted(Object.keys(radiusScale)), 'Optional. Corner size. Default "md".'],
  ["fonts", "{ body, heading, mono }", "Optional. Font ids by slot. Each slot left out uses Geist Sans or Geist Mono."],
  ["mode", quoted(themeModes), 'Optional. Locks light or dark. Default "auto".'],
];

/** The size limits a theme must stay inside. */
export const themeLimitRows: [string, string][] = [
  ["Theme JSON", `${artifactThemeLimits.maxInputChars.toLocaleString("en-US")} characters, as JSON text. A full theme is about 1,500.`],
  ["Preset id", `${String(artifactThemeLimits.maxPresetIdChars)} characters.`],
  ["One color", "64 characters."],
  ["chart", `${String(CHART_MIN)} to ${String(CHART_MAX)} colors in each palette.`],
  ["Problems listed", "The first 12, then a count of the rest."],
];
