/**
 * A dot-matrix sign for the landing page: a word in a 5 by 7 pixel font,
 * centred on a field of dim dots. Pure, so the server and the browser draw
 * the same picture.
 */

const glyphs: Record<string, readonly string[]> = {
  M: ["X...X", "XX.XX", "X.X.X", "X.X.X", "X...X", "X...X", "X...X"],
  I: [".XXX.", "..X..", "..X..", "..X..", "..X..", "..X..", ".XXX."],
  T: ["XXXXX", "..X..", "..X..", "..X..", "..X..", "..X..", "..X.."],
};

const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;
const GLYPH_GAP = 2;

/** One dot: lit dots spell the word; dim dots fill the field at one of three strengths, or not at all (level 0). */
export interface MatrixDot {
  x: number;
  y: number;
  lit: boolean;
  level: 0 | 1 | 2 | 3;
}

/** A stable 0-1 value per cell, so the field looks scattered but never changes between renders. */
function noise(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function dimLevel(x: number, y: number): MatrixDot["level"] {
  const value = noise(x, y);
  if (value < 0.42) return 0;
  if (value < 0.75) return 1;
  if (value < 0.93) return 2;
  return 3;
}

/** The cells of `word` that are lit, as "x,y" keys, with the word centred on the field. */
function litCells(word: string, columns: number, rows: number): Set<string> {
  const letters = Array.from(word.toUpperCase(), (letter) => glyphs[letter]).filter((glyph) => glyph !== undefined);
  const width = letters.length * GLYPH_WIDTH + Math.max(0, letters.length - 1) * GLYPH_GAP;
  const left = Math.floor((columns - width) / 2);
  const top = Math.floor((rows - GLYPH_HEIGHT) / 2);
  const lit = new Set<string>();
  letters.forEach((glyph, index) => {
    const offset = left + index * (GLYPH_WIDTH + GLYPH_GAP);
    glyph.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === "X") lit.add(`${String(offset + x)},${String(top + y)}`);
      }
    });
  });
  return lit;
}

/**
 * Every dot to draw for `word` on a `columns` by `rows` field. Letters the
 * font lacks are skipped. Empty cells (level 0, not lit) are left out.
 */
export function dotMatrix(word: string, columns: number, rows: number): MatrixDot[] {
  const lit = litCells(word, columns, rows);
  const dots: MatrixDot[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const isLit = lit.has(`${String(x)},${String(y)}`);
      const level = isLit ? 3 : dimLevel(x, y);
      if (isLit || level > 0) dots.push({ x, y, lit: isLit, level });
    }
  }
  return dots;
}
