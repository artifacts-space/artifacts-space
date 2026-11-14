import { describe, expect, it } from "vitest";

import { presetTheme } from "@/lib/themes/resolve";
import type { Theme } from "@/lib/themes/schema";
import { noThemeChoices, type ThemeChoices } from "@/lib/themes/theme-choice-types";

import { themeOptionGroups, themeOptions } from "./theme-options";

function preset(id: string): Theme {
  const theme = presetTheme(id);
  if (!theme) throw new Error(`no built-in preset ${id}`);
  return theme;
}

const teamChoices: ThemeChoices = {
  groups: [
    {
      teamId: "t1",
      teamName: "Acme",
      presets: [
        { ref: "team:acme-brand", name: "Brand", description: "", theme: preset("ink") },
        { ref: "team:acme-reports", name: "Reports", description: "For monthly reports", theme: preset("editorial") },
      ],
    },
  ],
  inherited: { name: "Brand", theme: preset("ink") },
  manageable: [],
};

describe("themeOptions", () => {
  it("should show each built-in's fonts under its name when there are no team choices", () => {
    const shown = themeOptions(noThemeChoices).map((option) => `${option.name} / ${option.detail}`);
    expect(shown).toEqual([
      "Default / Geist Sans",
      "Paper / Work Sans",
      "Graphite / IBM Plex Sans",
      "Ink / Inter",
      "Ocean / DM Sans",
      "Forest / Manrope",
      "Editorial / Instrument Serif · Source Serif 4",
      "Classic / Roboto",
    ]);
  });

  it("should describe each option with what the swatch does not show when it has a description", () => {
    const options = themeOptions(teamChoices, preset("paper"));
    const descriptions = new Map(options.map((option) => [option.key, option.description]));
    expect(descriptions.get("custom")).toBe("This artifact's own theme");
    expect(descriptions.get("inherit")).toBe("Set by the team");
    expect(descriptions.get("team:acme-brand")).toBe("A team preset");
    expect(descriptions.get("team:acme-reports")).toBe("For monthly reports");
    expect(descriptions.get("paper")).toMatch(/^Cream pages/);
  });

  it("should keep the tooltip each option had when its accessible description is shorter", () => {
    const options = new Map(themeOptions(teamChoices, preset("paper")).map((option) => [option.key, option.hint]));
    expect(options.get("custom")).toBe("Custom: this artifact's own theme");
    expect(options.get("inherit")).toBe("Team default: Brand, set by the team");
    expect(options.get("team:acme-brand")).toBe("Brand: A team preset (Team Acme)");
    expect(options.get("paper")).toBe("Paper: Cream pages, sepia ink, and a sienna accent, in Work Sans.");
  });
});

describe("themeOptionGroups", () => {
  it("should put every option in one run without a heading when the picker has no groups", () => {
    const groups = themeOptionGroups(themeOptions(noThemeChoices));
    expect(groups).toHaveLength(1);
    expect(groups[0]?.heading).toBeNull();
    expect(groups[0]?.options.map(({ index }) => index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("should split the options into runs under their headings, keeping each option's place in the list", () => {
    const groups = themeOptionGroups(themeOptions(teamChoices, preset("paper")));
    expect(groups.map((group) => [group.heading, group.options.map(({ option, index }) => `${String(index)}:${option.key}`)])).toEqual([
      ["This artifact", ["0:custom"]],
      ["Team default", ["1:inherit"]],
      ["Team · Acme", ["2:team:acme-brand", "3:team:acme-reports"]],
      ["Built-in", ["4:default", "5:paper", "6:graphite", "7:ink", "8:ocean", "9:forest", "10:editorial", "11:classic"]],
    ]);
  });
});
