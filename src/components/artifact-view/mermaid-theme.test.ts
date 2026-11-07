import { describe, expect, it } from "vitest";

import { diagramThemeCss, diagramThemeVariables, type DiagramPalette } from "./mermaid-theme";

const palette: DiagramPalette = {
  surface: "#ffffff",
  subtle: "#f5f5f4",
  stroke: "#c8c6c2",
  line: "#8d8a86",
  text: "#1c1917",
  muted: "#78716c",
  series: ["#2a78d6", "#eb6834"],
  onSeries: "#ffffff",
};

describe("diagramThemeVariables", () => {
  it("should turn off shadows and gradients when building the theme", () => {
    const variables = diagramThemeVariables(palette, "Geist");
    expect(variables.dropShadow).toBe("none");
    expect(variables.useGradient).toBe(false);
    expect(variables.strokeWidth).toBe(1);
  });

  it("should take every node and edge color from the palette when building the theme", () => {
    const variables = diagramThemeVariables(palette, "Geist");
    expect(variables.nodeBorder).toBe(palette.stroke);
    expect(variables.lineColor).toBe(palette.line);
    expect(variables.edgeLabelBackground).toBe(palette.surface);
    expect(variables.pie3).toBe(palette.series[0]);
  });
});

describe("diagramThemeCss", () => {
  it("should give edge labels an opaque pill in the frame color when styling the diagram", () => {
    const css = diagramThemeCss(palette);
    expect(css).toContain("opacity: 1 !important");
    expect(css).toContain(`fill: ${palette.surface} !important`);
    expect(css).toContain("filter: none !important");
  });
});
