import { describe, expect, it } from "vitest";

import { buildIdenticon, cyrb53, identiconLayout, identiconPaths, MAX_FILL, MIN_FILL, mirrorHalf, type Identicon } from "./identicon";
import { AVATAR_HUES } from "./palette";

const sampleIds = Array.from({ length: 1000 }, (_, index) => `user_${index.toString(36)}_${String(index * 7919)}`);
const hexes = new Set<string>(AVATAR_HUES.map((hue) => hue.hex));

function key(identicon: Identicon) {
  return `${identicon.primary}${identicon.secondary}${identicon.cells.join("")}`;
}

function filled(identicon: Identicon) {
  return identicon.cells.filter((cell) => cell !== 0).length;
}

describe("cyrb53", () => {
  it("should return the same hash when given the same text", () => {
    expect(cyrb53("abc")).toBe(cyrb53("abc"));
  });

  it("should return different hashes when the text differs by one character", () => {
    expect(cyrb53("abc")).not.toBe(cyrb53("abd"));
  });
});

describe("buildIdenticon", () => {
  it("should give the same grid and colors when given the same seed", () => {
    for (const id of sampleIds.slice(0, 50)) expect(buildIdenticon(id)).toEqual(buildIdenticon(id));
  });

  it("should keep a known seed's avatar fixed across releases", () => {
    // Changing the hash, palette order, or draw order would change everyone's avatar.
    expect(key(buildIdenticon("dev-user"))).toMatchInlineSnapshot(`"#BC48BB#D8488C1101110201100010010012221"`);
  });

  it("should rarely repeat an avatar when given 1,000 different seeds", () => {
    const keys = new Set(sampleIds.map((id) => key(buildIdenticon(id))));
    expect(keys.size).toBeGreaterThanOrEqual(995);
  });

  it("should spread seeds over every hue when given 1,000 seeds", () => {
    const used = new Set(sampleIds.map((id) => buildIdenticon(id).primary));
    expect(used.size).toBe(AVATAR_HUES.length);
  });

  it("should use palette colors that are ring neighbours", () => {
    for (const id of sampleIds.slice(0, 200)) {
      const { primary, secondary } = buildIdenticon(id);
      expect(hexes.has(primary) && hexes.has(secondary)).toBe(true);
      const gap = Math.abs(AVATAR_HUES.findIndex((hue) => hue.hex === primary) - AVATAR_HUES.findIndex((hue) => hue.hex === secondary));
      expect([1, AVATAR_HUES.length - 1]).toContain(gap);
    }
  });

  it.each([5, 7])("should mirror every row when the grid is %i wide", (gridSize) => {
    for (const id of sampleIds.slice(0, 200)) {
      const { cells } = buildIdenticon(id, gridSize);
      expect(cells).toHaveLength(gridSize * gridSize);
      for (let row = 0; row < gridSize; row++) {
        const line = cells.slice(row * gridSize, (row + 1) * gridSize);
        expect(line).toEqual([...line].reverse());
      }
    }
  });

  it.each([5, 7])("should keep the fill between the minimum and maximum when the grid is %i wide", (gridSize) => {
    const total = gridSize * gridSize;
    for (const id of sampleIds) {
      const count = filled(buildIdenticon(id, gridSize));
      expect(count).toBeGreaterThanOrEqual(Math.ceil(total * MIN_FILL));
      expect(count).toBeLessThanOrEqual(Math.floor(total * MAX_FILL));
    }
  });

  it("should draw an avatar when the seed is empty", () => {
    expect(filled(buildIdenticon(""))).toBeGreaterThan(0);
  });
});

describe("mirrorHalf", () => {
  it("should copy the left columns to the right when given a half grid", () => {
    expect(mirrorHalf([1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 5).slice(0, 5)).toEqual([1, 0, 2, 0, 1]);
  });
});

describe("identiconLayout", () => {
  it.each([
    [20, 3, 2.5],
    [32, 5, 3.5],
    [64, 10, 7],
  ])("should use whole-pixel cells when the avatar is %ipx", (size, cell, offset) => {
    expect(identiconLayout(size, 5)).toEqual({ cell, offset });
  });

  it("should never use cells smaller than one pixel when the avatar is tiny", () => {
    expect(identiconLayout(4, 7).cell).toBe(1);
  });
});

describe("identiconPaths", () => {
  it("should draw one square per filled cell, split by color", () => {
    const identicon = buildIdenticon("paths");
    const { primary, secondary } = identiconPaths(identicon, 20);
    const squares = (primary.match(/M/g) ?? []).length + (secondary.match(/M/g) ?? []).length;
    expect(squares).toBe(filled(identicon));
  });
});
