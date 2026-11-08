import { describe, expect, it } from "vitest";

import { PIXEL_GRID, pixelIcons, pixelPaths } from "./pixel-icons";

const cells = (path = "") => [...path.matchAll(/M(\d+) (\d+)h(\d+)/g)].map(([, x, y, w]) => ({ x: Number(x), y: Number(y), w: Number(w) }));

describe("pixelIcons", () => {
  it.each(Object.entries(pixelIcons))("should keep %s rectangular, drawn only in known tones, with room for its shadow", (_name, rows) => {
    const width = rows[0].length;
    expect(rows.every((row) => row.length === width)).toBe(true);
    expect(rows.join("")).toMatch(/^[cbap.]+$/);
    expect(width).toBeLessThan(PIXEL_GRID);
    expect(rows.length).toBeLessThan(PIXEL_GRID);
  });
});

describe("pixelPaths", () => {
  it("should merge a run of same-tone cells into one rectangle when they sit on one row", () => {
    expect(pixelPaths(["ccc"]).base).toBe("M6 7h3v1h-3z");
  });

  it("should cast a shadow one cell down and right when the cell there is empty", () => {
    const paths = pixelPaths(["c"]);
    expect(paths.base).toBe("M7 7h1v1h-1z");
    expect(paths.shade).toBe("M8 8h1v1h-1z");
  });

  it("should leave out the shadow when a drawn cell covers it", () => {
    expect(pixelPaths(["cc", "cc"]).shade).toBe("M8 7h1v1h-1zM7 8h2v1h-2z");
  });

  it("should keep every cell inside the grid when any icon is drawn", () => {
    for (const rows of Object.values(pixelIcons)) {
      for (const path of Object.values(pixelPaths(rows))) {
        for (const { x, y, w } of cells(path)) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(x + w).toBeLessThanOrEqual(PIXEL_GRID);
          expect(y).toBeLessThan(PIXEL_GRID);
        }
      }
    }
  });
});
