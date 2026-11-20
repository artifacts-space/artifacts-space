import { describe, expect, it } from "vitest";

import { applyOverlayTheme, type OverlayThemeTarget } from "./overlay-theme";

/** A body with these inline custom properties and classes. */
function body(properties: Record<string, string> = {}, classes: string[] = []) {
  const style = new Map(Object.entries(properties));
  const classList = new Set(classes);
  const target: OverlayThemeTarget = {
    style: {
      getPropertyValue: (name) => style.get(name) ?? "",
      setProperty: (name, value) => { style.set(name, value); },
      removeProperty: (name) => style.delete(name),
    },
    classList: { contains: (name) => classList.has(name), add: (name) => { classList.add(name); }, remove: (name) => { classList.delete(name); } },
  };
  return { target, style, classList };
}

describe("applyOverlayTheme", () => {
  it("should put the theme's colors and mode lock on the body, and take them off again", () => {
    const { target, style, classList } = body();
    const undo = applyOverlayTheme(target, { modeClass: "dark", style: { "--popover": "oklch(0.2 0 0)", "--border": "oklch(0.3 0 0)" } });
    expect(Object.fromEntries(style)).toEqual({ "--popover": "oklch(0.2 0 0)", "--border": "oklch(0.3 0 0)" });
    expect([...classList]).toEqual(["dark"]);
    undo();
    expect(style.size).toBe(0);
    expect(classList.size).toBe(0);
  });

  it("should put back a value that was there before, and leave a mode class it did not add", () => {
    const { target, style, classList } = body({ "--popover": "white" }, ["dark"]);
    const undo = applyOverlayTheme(target, { modeClass: "dark", style: { "--popover": "black" } });
    expect(style.get("--popover")).toBe("black");
    undo();
    expect(style.get("--popover")).toBe("white");
    expect([...classList]).toEqual(["dark"]);
  });

  it("should change nothing for the site's own palette with no mode lock", () => {
    const { target, style, classList } = body();
    applyOverlayTheme(target, { modeClass: null, style: {} })();
    expect(style.size).toBe(0);
    expect(classList.size).toBe(0);
  });
});
