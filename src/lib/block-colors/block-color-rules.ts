import { z } from "zod";

/*
 * Block colors: a text color and a background for a line of text (a
 * paragraph or heading, also inside lists and quotes). In Markdown they are
 * an HTML comment at the end of the line's text, which every other Markdown
 * reader hides:
 *
 *   A line in red on a blue background <!-- color: red; background: blue -->
 *
 * The rules here are shared by the editor, the read view, and the link
 * preview text (markdown-dialect.md, "Block colors").
 */

/** The hues a block can take, in menu order. Each is a theme token pair in globals.css. */
export const blockHues = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"] as const;

export type BlockHue = (typeof blockHues)[number];

/** Which part of a block a hue colors. */
export type BlockColorPart = "color" | "background";

/** A block's colors; null is the default. */
export interface BlockColors {
  color: BlockHue | null;
  background: BlockHue | null;
}

export const noBlockColors: BlockColors = { color: null, background: null };

const hueSchema = z.enum(blockHues);

/** A hue from untrusted input (an attribute, a data- attribute, Markdown), or null when it is not one. */
export function readBlockHue(value: unknown): BlockHue | null {
  const parsed = hueSchema.safeParse(typeof value === "string" ? value.trim().toLowerCase() : value);
  return parsed.success ? parsed.data : null;
}

/** The colors in a node's attributes, read defensively. */
export function readBlockColors(attrs: Readonly<Record<string, unknown>> | null | undefined): BlockColors {
  return { color: readBlockHue(attrs?.color), background: readBlockHue(attrs?.background) };
}

/** True when either color is set. */
export function hasBlockColors(colors: BlockColors): boolean {
  return colors.color !== null || colors.background !== null;
}

/** A whole HTML comment made only of `name: value` declarations, split by `;`. */
const markerPattern = /^<!--\s*([a-z-]+\s*:[^;>]*(?:;\s*[a-z-]+\s*:[^;>]*)*;?)\s*-->$/i;

/**
 * The colors a color comment names, or null when `raw` is not a color
 * comment: an HTML comment of `name: value` declarations that names `color`
 * or `background`. Unknown names and values that are not hues are ignored,
 * so `<!-- color: teal -->` is a color comment with no colors.
 */
export function parseColorMarker(raw: string): BlockColors | null {
  const body = markerPattern.exec(raw.trim())?.[1];
  if (body === undefined) return null;
  const colors: BlockColors = { color: null, background: null };
  let named = false;
  for (const declaration of body.split(";")) {
    const [name = "", value = ""] = declaration.split(":");
    const key = name.trim().toLowerCase();
    if (key !== "color" && key !== "background") continue;
    named = true;
    colors[key] = readBlockHue(value);
  }
  return named ? colors : null;
}

/** The comment that stores `colors`, color first, or "" when there are none. */
export function colorMarker(colors: BlockColors): string {
  const parts = [colors.color ? `color: ${colors.color}` : null, colors.background ? `background: ${colors.background}` : null].filter((part) => part !== null);
  return parts.length > 0 ? `<!-- ${parts.join("; ")} -->` : "";
}

/** The data- attributes that draw a block's colors, in the editor and the read view. */
export function blockColorAttributes(colors: BlockColors): Record<string, string> {
  const attributes: Record<string, string> = {};
  if (colors.color) attributes["data-block-color"] = colors.color;
  if (colors.background) attributes["data-block-background"] = colors.background;
  return attributes;
}

/** "Red", for menus. */
export function hueLabel(hue: BlockHue): string {
  return `${hue.charAt(0).toUpperCase()}${hue.slice(1)}`;
}

/**
 * The name of one color choice: "Red text", "Red background", "Default
 * text". With `shown: "inSection"`, the shorter text a row shows under its
 * section's label in the Color submenu ("Red" under Text color, "Default"
 * under either); its accessible name stays the full one.
 */
export function colorChoiceLabel(part: BlockColorPart, hue: BlockHue | null, shown: "full" | "inSection" = "full"): string {
  const name = hue ? hueLabel(hue) : "Default";
  if (shown === "inSection" && (part === "color" || hue === null)) return name;
  return `${name} ${part === "color" ? "text" : "background"}`;
}
