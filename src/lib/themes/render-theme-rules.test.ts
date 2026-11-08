import { describe, expect, it } from "vitest";

import { presetTheme } from "./resolve";
import { resolvesWithoutTeam } from "./render-theme-rules";

describe("resolvesWithoutTeam", () => {
  it("should resolve in the browser when the artifact uses a built-in preset", () => {
    expect(resolvesWithoutTeam("ocean", "team")).toBe(true);
  });

  it("should resolve in the browser when the artifact carries its own theme JSON", () => {
    const theme = presetTheme("paper");
    if (!theme) throw new Error("no paper preset");
    expect(resolvesWithoutTeam(theme, "public")).toBe(true);
  });

  it("should resolve in the browser when a private artifact has no theme", () => {
    expect(resolvesWithoutTeam(null, "private")).toBe(true);
  });

  it("should ask the server when a shared artifact has no theme and may inherit its team default", () => {
    for (const visibility of ["team", "link", "public"] as const) expect(resolvesWithoutTeam(null, visibility)).toBe(false);
  });

  it("should ask the server when the artifact uses a team preset", () => {
    expect(resolvesWithoutTeam("team:acme-brand", "private")).toBe(false);
    expect(resolvesWithoutTeam("custom", "public")).toBe(false);
  });
});
