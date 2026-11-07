import { smallestFontSize } from "@/lib/svg-text-size";

import { diagramLayout, diagramThemeCss, diagramThemeVariables, type DiagramPalette } from "./mermaid-theme";

/** A rendered diagram: SVG text, the size its viewBox asks for, and its smallest font size in user units. */
export interface RenderedDiagram {
  svg: string;
  width: number;
  height: number;
  smallestFont: number;
}

/** What a render needs from the page: token colors, the font stack, and the embedded font rule. */
export interface DiagramStyle {
  palette: DiagramPalette;
  fontFamily: string;
  fontFace: string;
}

let queue: Promise<unknown> = Promise.resolve();
let counter = 0;

function viewBoxSize(svg: string): { width: number; height: number } {
  const match = /viewBox="[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)"/.exec(svg);
  const width = Number(match?.[1] ?? 0);
  const height = Number(match?.[2] ?? 0);
  return width > 0 && height > 0 ? { width, height } : { width: 600, height: 400 };
}

/** Arrowheads and relation ends are drawn at this share of Mermaid's size: small and precise. */
const markerScale = 0.65;

function round(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * Shrinks one marker. A marker without a viewBox gets one at its own size
 * first, so its shape scales instead of being clipped. refX and refY stay in
 * viewBox units, so the tip still lands on the end of its line.
 */
function shrinkMarker(marker: Element) {
  const width = Number(marker.getAttribute("markerWidth"));
  const height = Number(marker.getAttribute("markerHeight"));
  if (!(width > 0 && height > 0)) return;
  if (!marker.hasAttribute("viewBox")) marker.setAttribute("viewBox", `0 0 ${round(width)} ${round(height)}`);
  marker.setAttribute("markerWidth", round(width * markerScale));
  marker.setAttribute("markerHeight", round(height * markerScale));
}

/**
 * Finishes Mermaid's SVG: shrinks every arrowhead marker (the viewBox and refX
 * stay, so each tip still lands on its line's end) and adds the embedded font
 * rule, which Mermaid drops from themeCSS. The font comes from our own origin.
 */
function refineSvg(svg: string, fontFace: string): string {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (doc.querySelector("parsererror")) return svg;
  for (const marker of Array.from(doc.querySelectorAll("marker"))) shrinkMarker(marker);
  if (fontFace) {
    const style = doc.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = fontFace;
    doc.documentElement.prepend(style);
  }
  return new XMLSerializer().serializeToString(doc.documentElement);
}

async function renderNow(code: string, style: DiagramStyle): Promise<RenderedDiagram> {
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({
    startOnLoad: false,
    // Strict: no click handlers, no HTML in labels, output sanitized.
    securityLevel: "strict",
    htmlLabels: false,
    suppressErrorRendering: true,
    theme: "base",
    look: "classic",
    fontFamily: style.fontFamily,
    themeVariables: diagramThemeVariables(style.palette, style.fontFamily),
    themeCSS: diagramThemeCss(style.palette),
    ...diagramLayout(style.fontFamily),
  });
  counter += 1;
  const { svg } = await mermaid.render(`artifact-mermaid-${String(counter)}`, code);
  const refined = refineSvg(svg, style.fontFace);
  return { svg: refined, ...viewBoxSize(refined), smallestFont: smallestFontSize(refined) };
}

/**
 * Renders Mermaid source to SVG text. Mermaid loads only on the first call.
 * Renders run one at a time because Mermaid's configuration is global.
 * The caller shows the result through an <img>, so nothing in it can run.
 */
export function renderMermaid(code: string, style: DiagramStyle): Promise<RenderedDiagram> {
  const run = queue.then(() => renderNow(code, style));
  queue = run.catch(() => undefined);
  return run;
}
