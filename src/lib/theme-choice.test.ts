import { describe, expect, it } from "vitest";

import { isThemeChoice, themeChoices, toThemeChoice } from "./theme-choice";

describe("themeChoices", () => {
  it("should list System first, then Light and Dark", () => {
    expect(themeChoices).toEqual(["system", "light", "dark"]);
  });
});

describe("isThemeChoice", () => {
  it("should accept each theme choice", () => {
    for (const choice of themeChoices) expect(isThemeChoice(choice)).toBe(true);
  });

  it("should reject other values", () => {
    expect(isThemeChoice("sepia")).toBe(false);
    expect(isThemeChoice(undefined)).toBe(false);
    expect(isThemeChoice(1)).toBe(false);
  });
});

describe("toThemeChoice", () => {
  it("should keep a stored choice when it is valid", () => {
    expect(toThemeChoice("dark")).toBe("dark");
    expect(toThemeChoice("light")).toBe("light");
  });

  it("should select System when nothing is stored", () => {
    expect(toThemeChoice(undefined)).toBe("system");
  });

  it("should select System when the stored value is unknown", () => {
    expect(toThemeChoice("sepia")).toBe("system");
  });
});
