/**
 * Pixel icons for the landing page, drawn in the blues of the brand icon.
 * Each icon is a character grid: `c` outline (the icon's base blue), `b` mid
 * blue, `a` light blue, `p` pale fill, `.` empty. The renderer centres it on a
 * 16 by 16 grid and adds a one-cell drop shadow down and to the right, the
 * way the planet icon is shaded, so every icon gets the same light.
 */

/** The canvas every icon is centred on, in cells. */
export const PIXEL_GRID = 16;

type DrawnTone = "base" | "mid" | "light" | "pale";

const toneByChar = new Map<string, DrawnTone>([["c", "base"], ["b", "mid"], ["a", "light"], ["p", "pale"]]);

/** A colour step, from the darkest (the shadow) to the palest fill. */
export type PixelTone = "shade" | DrawnTone;

/** Paint order: the shadow first, the outline last. */
export const PIXEL_TONES: readonly PixelTone[] = ["shade", "pale", "light", "mid", "base"];

export const pixelIcons = {
  plan: [
    "ccccccccc...",
    "cpppppppcc..",
    "cpppppppcac.",
    "cpppppppcaac",
    "cpppppppcccc",
    "cpbbbbbbbbpc",
    "cppppppppppc",
    "cpbbbbbbpppc",
    "cppppppppppc",
    "cpaapbbbbbpc",
    "cpaapppppppc",
    "cppppppppppc",
    "cccccccccccc",
  ],
  comment: [
    "....ccccccccc",
    "....caaaaaaac",
    "....caaaaaaac",
    "cccccccccaaac",
    "cpppppppcaaac",
    "cpbpbpbpcaaac",
    "cpppppppccccc",
    "cpppppppc....",
    "cpccccccc....",
    "cc...........",
  ],
  history: [
    "....ccccc....",
    "..ccppbppcc..",
    ".caapppppppc.",
    ".capppcppppc.",
    "cappppcpppppc",
    "cpppppcpppppc",
    "cbppppccccpbc",
    "cpppppppppppc",
    "cpppppppppppc",
    ".cpppppppppc.",
    ".cpppppppppc.",
    "..ccppbppcc..",
    "....ccccc....",
  ],
  swap: [
    ".........c...",
    ".........cc..",
    ".aaaaaaaaccc.",
    ".cccccccccccc",
    ".ccccccccccc.",
    ".........cc..",
    ".........c...",
    ".............",
    "...b.........",
    "..bb.........",
    ".bbbaaaaaaaa.",
    "bbbbbbbbbbbb.",
    ".bbbbbbbbbbb.",
    "..bb.........",
    "...b.........",
  ],
  agents: [
    "..ccccccccccc",
    "..cbbbbbbbbbc",
    "ccccccccccccc",
    "caaaaaaaaacpc",
    "cccccccccccpc",
    "cpcpppppppcpc",
    "cppcppppppcpc",
    "cpcppbbpppcpc",
    "cpppppppppccc",
    "cpppppppppc..",
    "ccccccccccc..",
  ],
  team: [
    "..ccc.....c....",
    ".cpppc..ccccc..",
    ".cpppc..cpppc..",
    ".cpppc..cbpbc..",
    "..ccc...ccccc..",
    "...............",
    ".ccccc..ccccc..",
    "cpppppc.cbbbbbc",
    "cpppppc.cbbbbbc",
    "cpppppc.cbbbbbc",
    "ccccccc.ccccccc",
  ],
  skill: [
    ".cccccccccc",
    "cbcpppppppc",
    "cbcpaaaaapc",
    "cbcpaaaaapc",
    "cbcpppppppc",
    "cbcpbbbbbpc",
    "cbcpppppppc",
    "cbcpbbbpppc",
    "cbcpppppppc",
    "cbcpppppppc",
    "cbccccccccc",
    "cbppppppppc",
    "ccccccccccc",
  ],
  ask: [
    "ccccccccccccc",
    "cbbbbbbbbbbbc",
    "ccccccccccccc",
    "cpppppppppppc",
    "cpcpppppppppc",
    "cppcpbbbbbppc",
    "cpcpppppppppc",
    "cpppppppppppc",
    "cpaappppppppc",
    "ccccccccccccc",
  ],
  share: [
    ".....ccc.....",
    ".....cac.....",
    ".....ccc.....",
    "....b...b....",
    "....b...b....",
    "...b.....b...",
    "...b.....b...",
    "..b.......b..",
    "..b.......b..",
    ".b.........b.",
    "ccc.......ccc",
    "cacbbbbbbbcac",
    "ccc.......ccc",
  ],
} as const satisfies Record<string, readonly string[]>;

export type PixelIconName = keyof typeof pixelIcons;

/** One SVG path per tone, in grid cells. A tone with no cells is left out. */
export type PixelPaths = Partial<Record<PixelTone, string>>;

function toneAt(rows: readonly string[], x: number, y: number): DrawnTone | undefined {
  const char = rows[y]?.[x];
  return char === undefined ? undefined : toneByChar.get(char);
}

/** The tone of one cell once the grid is placed: drawn, shadow, or empty. */
function cellTone(rows: readonly string[], x: number, y: number): PixelTone | undefined {
  return toneAt(rows, x, y) ?? (toneAt(rows, x - 1, y - 1) ? "shade" : undefined);
}

/**
 * Turns an icon grid into one path per tone. Runs of same-tone cells on a row
 * become one rectangle, so a 16-cell icon stays a few hundred bytes.
 */
export function pixelPaths(rows: readonly string[]): PixelPaths {
  const width = Math.max(0, ...rows.map((row) => row.length)) + 1;
  const height = rows.length + 1;
  const left = Math.floor((PIXEL_GRID - width) / 2);
  const top = Math.floor((PIXEL_GRID - height) / 2);
  const paths: PixelPaths = {};
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      const tone = cellTone(rows, x, y);
      let end = x + 1;
      while (end < width && tone !== undefined && cellTone(rows, end, y) === tone) end++;
      if (tone) paths[tone] = `${paths[tone] ?? ""}M${String(left + x)} ${String(top + y)}h${String(end - x)}v1h-${String(end - x)}z`;
      x = end;
    }
  }
  return paths;
}
