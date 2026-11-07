import type { DiagramPalette } from "./mermaid-theme";

/**
 * Browser-only helpers that turn the page's design tokens into what a Mermaid
 * <img> needs: opaque hex colors (an image cannot read CSS variables) and the
 * Geist font embedded as a data URI (an image cannot load the page's fonts).
 */

let canvasContext: CanvasRenderingContext2D | null = null;

function context(): CanvasRenderingContext2D | null {
  canvasContext ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  return canvasContext;
}

function hex(value: number): string {
  return value.toString(16).padStart(2, "0");
}

/** Paints `color` over `backdrop` on one pixel and reads it back as #rrggbb, so oklch and alpha resolve to plain sRGB. */
function toOpaqueHex(color: string, backdrop: string): string {
  const ctx = context();
  if (!ctx) return backdrop;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Reads the diagram palette from the tokens in scope at `element`, so a ThemeScope or `.dark` wrapper applies. */
export function readPalette(element: Element): DiagramPalette {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(`--${name}`).trim();
  const surface = toOpaqueHex(token("card"), "#808080");
  const resolve = (name: string) => toOpaqueHex(token(name), surface);
  return {
    surface,
    subtle: resolve("muted"),
    stroke: resolve("diagram-stroke"),
    line: resolve("diagram-line"),
    text: resolve("foreground"),
    muted: resolve("muted-foreground"),
    series: Array.from({ length: 8 }, (_, index) => resolve(`series-${String(index + 1)}`)),
    onSeries: resolve("diagram-on-series"),
  };
}

/** The font stack the element renders with, such as `Geist, "Geist Fallback", ui-sans-serif`. */
export function readFontFamily(element: Element): string {
  return getComputedStyle(element).fontFamily || "ui-sans-serif, system-ui, sans-serif";
}

function primaryFamily(fontFamily: string): string {
  return unquote(fontFamily.split(",")[0] ?? "");
}

/** A unicode-range that starts at U+0, such as "U+0-FF, U+131": the basic latin file. */
const basicLatin = /(^|,)\s*U\+0+-/i;

function unquote(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

/** The woff2 URL of a @font-face rule for `family` that covers basic latin, or null. */
function latinWoff2(rule: CSSFontFaceRule, family: string, base: string): string | null {
  if (unquote(rule.style.getPropertyValue("font-family")) !== family) return null;
  const range = rule.style.getPropertyValue("unicode-range");
  if (range !== "" && !basicLatin.test(range)) return null;
  const url = /url\(["']?([^"')]+\.woff2)["']?\)/.exec(rule.style.getPropertyValue("src"))?.[1];
  // A relative url() resolves against the stylesheet, not the page.
  return url ? new URL(url, base).href : null;
}

function rulesOf(sheet: CSSStyleSheet): CSSRule[] {
  try {
    return Array.from(sheet.cssRules);
  } catch {
    // A cross-origin stylesheet hides its rules.
    return [];
  }
}

/** The URL of the latin @font-face file for `family` in the page's own stylesheets, if any. */
function fontFileUrl(family: string): string | null {
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of rulesOf(sheet)) {
      const url = rule instanceof CSSFontFaceRule ? latinWoff2(rule, family, sheet.href ?? document.baseURI) : null;
      if (url) return url;
    }
  }
  return null;
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { resolve(typeof reader.result === "string" ? reader.result : ""); };
    reader.onerror = () => { reject(reader.error ?? new Error("Could not read the font.")); };
    reader.readAsDataURL(blob);
  });
}

async function loadFontFace(family: string): Promise<string> {
  const url = fontFileUrl(family);
  if (!url || new URL(url).origin !== window.location.origin) return "";
  const response = await fetch(url);
  if (!response.ok) return "";
  const dataUri = await blobToDataUri(await response.blob());
  return dataUri ? `@font-face { font-family: "${family}"; src: url(${dataUri}) format("woff2"); font-weight: 100 900; font-style: normal; }` : "";
}

const fontFaces = new Map<string, Promise<string>>();

/**
 * An @font-face rule that embeds the page's sans font (Geist) as a data URI,
 * so the diagram image draws the same font Mermaid measured with. Empty when
 * the font cannot be found or fetched; the image then uses a system font.
 */
export function embeddedFontFace(fontFamily: string): Promise<string> {
  const family = primaryFamily(fontFamily);
  if (family === "") return Promise.resolve("");
  const pending = fontFaces.get(family) ?? loadFontFace(family).catch(() => "");
  fontFaces.set(family, pending);
  return pending;
}
