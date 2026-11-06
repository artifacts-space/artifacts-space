/** A small trend drawn from numbers: values scaled to 0..1, oldest first. */
export interface Sketch {
  shape: "bar" | "line";
  values: number[];
}

export interface SynopsisMetric {
  label: string;
  value: string;
}

/** Glyphs for formats that are never drawn from their content (user SVG, images, diagrams). */
export type SynopsisGlyph = "diagram" | "vector" | "file" | "page";

/**
 * What the right-hand card of an artifact's social preview shows: a small,
 * plain-text picture of the artifact built from its approved content.
 */
export type Synopsis =
  | { type: "metrics"; metrics: SynopsisMetric[]; sketch: Sketch | null }
  | { type: "chart"; title: string | null; sketch: Sketch }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "components"; names: string[] }
  | { type: "prose"; heading: string | null; body: string }
  | { type: "code"; language: string; lines: string[] }
  | { type: "glyph"; glyph: SynopsisGlyph; label: string; detail: string | null };
