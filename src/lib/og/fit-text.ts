/*
 * Picks a font size so a headline fits a box in a set number of lines.
 * Satori cannot measure text before layout, so this estimates each line's
 * width from rough per-character widths (in em) and wraps words greedily.
 * The estimates lean wide, so a real line is never longer than predicted.
 */

/*
 * Tiers from Geist SemiBold's advance widths (the weight preview text uses),
 * each rounded up: narrow glyphs are 0.20-0.31 em, mid 0.38-0.43, most
 * lowercase 0.55-0.63, capitals up to 0.76, and the widest up to 0.99.
 */
const NARROW = "ijlI.,:;'!|’ ";
const MID = "ftr()[]1";
const WIDE = "mwMW@%";

/** Rough advance width of one character in em, letter spacing excluded. */
function charWidthEm(char: string): number {
  if (NARROW.includes(char)) return 0.31;
  if (MID.includes(char)) return 0.45;
  if (WIDE.includes(char)) return 1;
  if (char >= "A" && char <= "Z") return 0.76;
  if (char >= "0" && char <= "9") return 0.68;
  return 0.63;
}

/** Estimated width of `text` in px at `fontSize` with letter spacing in em. */
export function estimateTextWidth(text: string, fontSize: number, letterSpacingEm = 0): number {
  let em = 0;
  for (const char of text) em += charWidthEm(char) + letterSpacingEm;
  return em * fontSize;
}

/** How many lines `text` takes when wrapped greedily at word breaks into `maxWidth` px. */
export function estimateLineCount(text: string, fontSize: number, maxWidth: number, letterSpacingEm = 0): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const space = estimateTextWidth(" ", fontSize, letterSpacingEm);
  let lines = 1;
  let lineWidth = 0;
  for (const word of words) {
    const wordWidth = estimateTextWidth(word, fontSize, letterSpacingEm);
    const wordLines = Math.max(1, Math.ceil(wordWidth / maxWidth));
    if (lineWidth === 0) {
      lines += wordLines - 1;
      lineWidth = wordWidth - (wordLines - 1) * maxWidth;
      continue;
    }
    if (lineWidth + space + wordWidth <= maxWidth) {
      lineWidth += space + wordWidth;
      continue;
    }
    lines += wordLines;
    lineWidth = wordWidth - (wordLines - 1) * maxWidth;
  }
  return lines;
}

export interface FitOptions {
  /** Box width in px. */
  maxWidth: number;
  /** Box height in px. A size may use as many lines as fit in it. */
  maxHeight: number;
  /** Line height as a multiple of the font size. */
  lineHeight: number;
  /** Font sizes to try, largest first. The last one is used when none fit. */
  sizes: readonly [number, ...number[]];
  /** Letter spacing in em, usually negative for display type. */
  letterSpacingEm?: number;
}

export interface FittedText {
  fontSize: number;
  /** Most lines that fit in the box at `fontSize`. Clamp the text to this. */
  maxLines: number;
  /** True when even the smallest size needs more than `maxLines` lines, so the clamp cuts the text. */
  clamped: boolean;
}

/** Lines of `fontSize` text that fit in `maxHeight`, at least one. */
function linesThatFit(fontSize: number, maxHeight: number, lineHeight: number): number {
  return Math.max(1, Math.floor(maxHeight / (fontSize * lineHeight)));
}

/** The largest size from `sizes` at which `text` fits the box, and the line clamp for that size. */
export function fitText(text: string, { maxWidth, maxHeight, lineHeight, sizes, letterSpacingEm = 0 }: FitOptions): FittedText {
  for (const fontSize of sizes) {
    const maxLines = linesThatFit(fontSize, maxHeight, lineHeight);
    if (estimateLineCount(text, fontSize, maxWidth, letterSpacingEm) <= maxLines) return { fontSize, maxLines, clamped: false };
  }
  const fontSize = sizes[sizes.length - 1] ?? sizes[0];
  return { fontSize, maxLines: linesThatFit(fontSize, maxHeight, lineHeight), clamped: true };
}
