import { describe, expect, it } from "vitest";

import { contrastRatio, ensureContrast, formatOklch, mixOklch, normalizeColor, parseColor } from "./color";

const parsed = (value: string) => {
  const color = parseColor(value);
  if (!color) throw new Error(`could not parse ${value}`);
  return color;
};

describe("parseColor", () => {
  it("should read every accepted syntax as the same color when they describe white", () => {
    for (const value of ["#fff", "#ffffff", "#ffff", "#ffffffff", "rgb(255 255 255)", "rgb(255, 255, 255)", "rgba(255,255,255,1)", "rgb(100% 100% 100%)", "hsl(0 0% 100%)", "hsla(0, 0%, 100%, 1)", "oklch(1 0 0)", "oklch(100% 0 0)"]) {
      expect(normalizeColor(value), value).toBe("oklch(1 0 0)");
    }
  });

  it("should match known OKLCH values when converting sRGB", () => {
    const red = parsed("#ff0000");
    expect(red.l).toBeCloseTo(0.628, 3);
    expect(red.c).toBeCloseTo(0.2577, 3);
    expect(red.h).toBeCloseTo(29.23, 1);
  });

  it("should keep alpha when the color has one", () => {
    expect(normalizeColor("oklch(0.2 0.006 60 / 0.09)")).toBe("oklch(0.2 0.006 60 / 0.09)");
    expect(normalizeColor("rgb(0 0 0 / 50%)")).toBe("oklch(0 0 0 / 0.5)");
  });

  it("should reject CSS that is not a plain color when it tries to smuggle code", () => {
    const attempts = [
      "url(https://evil.example/x.png)",
      "var(--brand)",
      "red; background: url(x)",
      "#fff}body{color:red",
      "oklch(0.5 0.1 200) /* hi */",
      "expression(alert(1))",
      "rgb(1 2 3) !important",
      "calc(1px)",
      "red",
      "transparent",
      "currentColor",
      "color-mix(in oklch, red, blue)",
      "light-dark(#fff, #000)",
      "oklch(0.5 0.1 200",
      "",
    ];
    for (const attempt of attempts) expect(parseColor(attempt), attempt).toBeNull();
  });

  it("should reject channels when they are out of range", () => {
    for (const value of ["rgb(256 0 0)", "rgb(-1 0 0)", "hsl(0 120% 50%)", "oklch(1.2 0 0)", "oklch(0.5 0.9 0)", "rgb(0 0 0 / 2)", "#ggg", "#12345"]) {
      expect(parseColor(value), value).toBeNull();
    }
  });
});

describe("contrastRatio", () => {
  it("should give 21:1 for black on white and 1:1 for a color on itself when measured", () => {
    expect(contrastRatio(parsed("#000"), parsed("#fff"))).toBeCloseTo(21, 1);
    expect(contrastRatio(parsed("#777"), parsed("#777"))).toBeCloseTo(1, 5);
  });

  it("should match the WCAG reference ratio when grey #767676 sits on white", () => {
    expect(contrastRatio(parsed("#767676"), parsed("#fff"))).toBeCloseTo(4.54, 2);
  });
});

describe("ensureContrast", () => {
  it("should darken text until it passes when the background is light", () => {
    const fixed = ensureContrast(parsed("#aaaaaa"), parsed("#ffffff"), 4.5);
    expect(contrastRatio(fixed, parsed("#ffffff"))).toBeGreaterThanOrEqual(4.5);
    expect(fixed.l).toBeLessThan(parsed("#aaaaaa").l);
  });

  it("should lighten text until it passes when the background is dark", () => {
    const fixed = ensureContrast(parsed("#444444"), parsed("#111111"), 4.5);
    expect(contrastRatio(fixed, parsed("#111111"))).toBeGreaterThanOrEqual(4.5);
    expect(fixed.l).toBeGreaterThan(parsed("#444444").l);
  });

  it("should return the color unchanged when it already passes", () => {
    const ink = parsed("#000");
    expect(ensureContrast(ink, parsed("#fff"), 4.5)).toBe(ink);
  });
});

describe("mixOklch", () => {
  it("should land halfway in lightness and keep the chromatic hue when one side is grey", () => {
    const mixed = mixOklch(parsed("oklch(0.4 0.1 250)"), parsed("oklch(1 0 0)"), 0.5);
    expect(formatOklch(mixed)).toBe("oklch(0.7 0.05 250)");
  });
});
