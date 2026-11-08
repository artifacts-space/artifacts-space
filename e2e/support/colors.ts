import type { Locator } from "@playwright/test";

/** What a reader sees of an element: the color behind it, its text color, and their contrast. */
export interface ColorReading {
  /** The color behind the element, with every translucent layer above the page composited, as "r,g,b". */
  background: string;
  /** The element's text color, composited on that background, as "r,g,b". */
  text: string;
  /** The WCAG contrast ratio of the text on the background. */
  contrast: number;
}

/**
 * Reads what a reader sees: the browser draws each ancestor's background and
 * then the text color on a 1 by 1 canvas, so oklch(), light-dark(), and
 * translucent bars resolve exactly as painted.
 */
export function readColors(locator: Locator): Promise<ColorReading> {
  return locator.evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("no canvas");
    const chain: Element[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) chain.unshift(node);
    const paint = (color: string) => {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
    };
    let background = paint("white");
    for (const node of chain) background = paint(getComputedStyle(node).backgroundColor);
    const text = paint(getComputedStyle(element).color);
    const luminance = (rgb: number[]) => {
      const [r = 0, g = 0, b = 0] = rgb.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [light, dark] = [luminance(background), luminance(text)].sort((a, b) => b - a);
    return { background: background.join(","), text: text.join(","), contrast: ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05) };
  });
}
