import { AVATAR_HUES } from "./palette";

/**
 * Mirrored pixel identicons, like GitHub's: the left half of a square grid is
 * drawn from a hash of a stable seed (a user or agent id) and mirrored to the
 * right. Pure and synchronous, so the server and the browser draw the same
 * avatar and hydration never mismatches.
 */

/** Empty cell, a cell in the first color, or a cell in the second color. */
export type IdenticonCell = 0 | 1 | 2;

export interface Identicon {
  /** Cells per side. */
  gridSize: number;
  /** Row-major, `gridSize * gridSize` long. */
  cells: IdenticonCell[];
  /** The main color: most filled cells and the background tint. */
  primary: string;
  /** A ring neighbour of the main color, for a few cells. */
  secondary: string;
}

/** The grid avatars use. 5×5 reads at 20px; 7×7 turns to noise there. */
export const AVATAR_GRID_SIZE = 5;

/** Share of filled cells allowed in the whole grid, so no avatar is blank or solid. */
export const MIN_FILL = 0.3;
export const MAX_FILL = 0.7;

/** Share of filled cells that take the second color. */
const SECONDARY_SHARE = 0.3;
/** Redraws before the fill is forced into range. Almost every seed needs one or two. */
const MAX_ATTEMPTS = 12;

/**
 * cyrb53: a small, fast, well-mixed 53-bit string hash. Not cryptographic,
 * and it does not need to be: it only spreads ids over avatars.
 */
export function cyrb53(text: string, salt = 0): number {
  let h1 = 0xdeadbeef ^ salt;
  let h2 = 0x41c6ce57 ^ salt;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** mulberry32: a tiny seeded generator of numbers in [0, 1). */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomFor(seed: string): () => number {
  const hash = cyrb53(seed);
  return mulberry32((hash % 4294967296) ^ Math.floor(hash / 4294967296));
}

/** Columns drawn at random: the left half plus the middle column. */
function halfWidth(gridSize: number) {
  return Math.ceil(gridSize / 2);
}

/** Cells in the full grid that one half-grid cell paints: two, or one in the middle column. */
function weightOf(column: number, gridSize: number) {
  return column === gridSize - 1 - column ? 1 : 2;
}

function fillCount(half: IdenticonCell[], gridSize: number) {
  const width = halfWidth(gridSize);
  let count = 0;
  half.forEach((cell, index) => {
    if (cell !== 0) count += weightOf(index % width, gridSize);
  });
  return count;
}

function fillRange(gridSize: number) {
  const total = gridSize * gridSize;
  return { min: Math.ceil(total * MIN_FILL), max: Math.floor(total * MAX_FILL) };
}

function drawHalf(random: () => number, gridSize: number): IdenticonCell[] {
  return Array.from({ length: gridSize * halfWidth(gridSize) }, () => {
    if (random() < 0.5) return 0;
    return random() < SECONDARY_SHARE ? 2 : 1;
  });
}

/** Flips cells in a fixed order until the fill is in range. Only reached after every redraw missed. */
function forceIntoRange(half: IdenticonCell[], gridSize: number): IdenticonCell[] {
  const { min, max } = fillRange(gridSize);
  const cells = [...half];
  for (let index = 0; index < cells.length; index++) {
    const count = fillCount(cells, gridSize);
    if (count < min && cells[index] === 0) cells[index] = 1;
    else if (count > max && cells[index] !== 0) cells[index] = 0;
  }
  return cells;
}

function drawFilledHalf(random: () => number, gridSize: number): IdenticonCell[] {
  const { min, max } = fillRange(gridSize);
  let half = drawHalf(random, gridSize);
  for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
    const count = fillCount(half, gridSize);
    if (count >= min && count <= max) return half;
    half = drawHalf(random, gridSize);
  }
  return forceIntoRange(half, gridSize);
}

/** Mirrors the left half (with the middle column) into a full row-major grid. */
export function mirrorHalf(half: readonly IdenticonCell[], gridSize: number): IdenticonCell[] {
  const width = halfWidth(gridSize);
  const cells: IdenticonCell[] = [];
  for (let row = 0; row < gridSize; row++) {
    for (let column = 0; column < gridSize; column++) {
      const source = column < width ? column : gridSize - 1 - column;
      cells.push(half[row * width + source] ?? 0);
    }
  }
  return cells;
}

function pickColors(random: () => number) {
  const count = AVATAR_HUES.length;
  const index = Math.floor(random() * count);
  const step = random() < 0.5 ? 1 : count - 1;
  const primary = AVATAR_HUES[index] ?? AVATAR_HUES[0];
  const secondary = AVATAR_HUES[(index + step) % count] ?? AVATAR_HUES[0];
  return { primary: primary.hex, secondary: secondary.hex };
}

/**
 * The identicon for a seed. The same seed always gives the same grid and
 * colors. Use the user id (agents are users too), never a name or handle,
 * which can change.
 */
export function buildIdenticon(seed: string, gridSize: number = AVATAR_GRID_SIZE): Identicon {
  const random = randomFor(seed);
  const colors = pickColors(random);
  const cells = mirrorHalf(drawFilledHalf(random, gridSize), gridSize);
  return { gridSize, cells, ...colors };
}

/** Where the grid sits in a square avatar of `size` pixels. */
export interface IdenticonLayout {
  /** Whole pixels per cell, so edges stay crisp. */
  cell: number;
  /** Space between the frame and the grid. */
  offset: number;
}

/** Share of the avatar the grid may cover. The rest is breathing room inside the frame. */
const GRID_SHARE = 0.8;

/**
 * Whole-pixel cells as large as fit in 80% of the avatar, centred. At 20px a
 * 5×5 grid gets 3px cells; at 32px, 5px cells.
 */
export function identiconLayout(size: number, gridSize: number): IdenticonLayout {
  const cell = Math.max(1, Math.floor((size * GRID_SHARE) / gridSize));
  return { cell, offset: (size - cell * gridSize) / 2 };
}

/**
 * One SVG path per color: a square per filled cell. Two paths draw faster and
 * smaller than a rect per cell.
 */
export function identiconPaths(identicon: Identicon, size: number): { primary: string; secondary: string } {
  const { cell, offset } = identiconLayout(size, identicon.gridSize);
  const paths = { primary: "", secondary: "" };
  identicon.cells.forEach((value, index) => {
    if (value === 0) return;
    const x = offset + (index % identicon.gridSize) * cell;
    const y = offset + Math.floor(index / identicon.gridSize) * cell;
    const square = `M${String(x)} ${String(y)}h${String(cell)}v${String(cell)}h-${String(cell)}z`;
    if (value === 1) paths.primary += square;
    else paths.secondary += square;
  });
  return paths;
}
