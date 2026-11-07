import { describe, expect, it } from "vitest";

import { themePresets } from "./presets";
import { parseTheme, type ThemeInput } from "./schema";

function base(): ThemeInput {
  const preset = themePresets.find((item) => item.id === "classic");
  if (!preset) throw new Error("classic preset missing");
  return structuredClone(preset.theme);
}

function issuesFor(input: unknown) {
  const result = parseTheme(input);
  return result.ok ? [] : result.issues;
}

describe("parseTheme", () => {
  it("should normalise colors to oklch when the input uses hex, rgb, and hsl", () => {
    const input = base();
    input.light.card = "#ffffff";
    input.light.background = "rgb(250 250 251)";
    input.dark.background = "hsl(220 10% 10%)";
    const result = parseTheme(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.theme.light.card).toBe("oklch(1 0 0)");
    expect(result.theme.light.background).toMatch(/^oklch\(0\.98\d* /);
    expect(result.theme.dark.background).toMatch(/^oklch\(/);
  });

  it("should fill defaults when mode, radius, and fonts are left out", () => {
    const { version, light, dark } = base();
    const result = parseTheme({ version, light, dark });
    expect(result.ok && result.theme).toMatchObject({ mode: "auto", radius: "md", fonts: { body: "geist-sans", heading: "geist-sans", mono: "geist-mono" } });
  });

  it("should reject the theme when a color carries an injection attempt", () => {
    const attempts = ["url(https://evil.example/a.png)", "var(--brand)", "#fff; background: red", "#fff}*{color:red", "oklch(0.5 0.1 200)/**/", "expression(alert(1))", "<script>", "@import 'x'"];
    for (const attempt of attempts) {
      const input = base();
      input.light.foreground = attempt;
      const issues = issuesFor(input);
      expect(issues.map((issue) => issue.path), attempt).toContain("light.foreground");
    }
  });

  it("should reject unknown keys when they appear at any level", () => {
    expect(issuesFor({ ...base(), css: "body{}" }).length).toBeGreaterThan(0);
    const nested = base();
    expect(issuesFor({ ...nested, light: { ...nested.light, sidebar: "#fff" } }).length).toBeGreaterThan(0);
    expect(issuesFor({ ...nested, fonts: { body: "inter", display: "inter" } }).length).toBeGreaterThan(0);
  });

  it("should reject the theme when the version is not 1", () => {
    expect(issuesFor({ ...base(), version: 2 }).map((issue) => issue.path)).toContain("version");
  });

  it("should reject a font when it is not on the allowlist", () => {
    const input = base();
    input.fonts = { body: "comic-sans" };
    const issues = issuesFor(input);
    expect(issues).toEqual([expect.objectContaining({ path: "fonts.body", message: expect.stringContaining("not an allowed font") as unknown })]);
  });

  it("should reject a display face when it is used for body text", () => {
    const input = base();
    input.fonts = { body: "instrument-serif" };
    expect(issuesFor(input)).toEqual([expect.objectContaining({ path: "fonts.body", message: expect.stringContaining("headings only") as unknown })]);
  });

  it("should reject a mono face outside the mono slot and a text face inside it", () => {
    const input = base();
    input.fonts = { heading: "jetbrains-mono", mono: "inter" };
    expect(issuesFor(input).map((issue) => issue.path).sort()).toEqual(["fonts.heading", "fonts.mono"]);
  });

  it("should accept a serif body face and a display heading when both are allowed", () => {
    const input = base();
    input.fonts = { body: "source-serif-4", heading: "fraunces", mono: "ibm-plex-mono" };
    expect(parseTheme(input).ok).toBe(true);
  });

  it("should reject alpha when the color is not the card edge", () => {
    const input = base();
    input.light.foreground = "oklch(0.2 0 0 / 0.5)";
    expect(issuesFor(input).map((issue) => issue.path)).toContain("light.foreground");
    const edge = base();
    edge.light.cardEdge = "oklch(0.2 0 0 / 0.1)";
    expect(parseTheme(edge).ok).toBe(true);
  });

  it("should reject the chart palette when it has too few or too many colors", () => {
    const short = base();
    short.light.chart = ["#000", "#111", "#222"];
    expect(issuesFor(short).map((issue) => issue.path)).toContain("light.chart");
    const long = base();
    long.dark.chart = Array.from({ length: 9 }, () => "#3987e5");
    expect(issuesFor(long).map((issue) => issue.path)).toContain("dark.chart");
  });

  it("should reject the theme with the pair and ratio when contrast is too low", () => {
    const input = base();
    input.light.mutedForeground = "#b0b0b0";
    const issues = issuesFor(input);
    expect(issues).toHaveLength(2);
    expect(issues[0]?.path).toBe("light.mutedForeground");
    expect(issues[0]?.message).toMatch(/light\.mutedForeground on light\.card is \d+\.\d\d:1; .* needs at least 4\.5:1/);
  });

  it("should reject a dark palette when its label on the accent is unreadable", () => {
    const input = base();
    input.dark.accentForeground = input.dark.accent;
    expect(issuesFor(input).map((issue) => issue.path)).toEqual(["dark.accentForeground"]);
  });

  it("should reject a light palette when its background is dark", () => {
    const input = base();
    input.light = { ...base().dark };
    expect(issuesFor(input).map((issue) => issue.path)).toEqual(expect.arrayContaining(["light.background", "light.card"]));
  });

  it("should reject anything that is not an object when given junk", () => {
    for (const junk of [null, "default", 42, [], { version: 1 }]) expect(parseTheme(junk).ok).toBe(false);
  });
});
