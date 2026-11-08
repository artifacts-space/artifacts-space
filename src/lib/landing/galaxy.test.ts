import { describe, expect, it } from "vitest";

import { ARTIFACT_SIZE, GALAXY_CENTER, GALAXY_HEIGHT, GALAXY_WIDTH, orbits, PLANET_SIZE, startOffset, stars } from "./galaxy";

describe("orbits", () => {
  it.each(orbits)("should keep every $id artifact inside the picture when it reaches the orbit's edge", (orbit) => {
    expect(GALAXY_CENTER.x - orbit.rx - ARTIFACT_SIZE / 2).toBeGreaterThanOrEqual(0);
    expect(GALAXY_CENTER.y - orbit.ry - ARTIFACT_SIZE / 2).toBeGreaterThanOrEqual(0);
  });

  it.each(orbits)("should keep $id artifacts clear of the planet when they pass above, below, or beside it", (orbit) => {
    expect(orbit.rx - ARTIFACT_SIZE / 2).toBeGreaterThan(PLANET_SIZE.width / 2);
    expect(orbit.ry - ARTIFACT_SIZE / 2).toBeGreaterThan(PLANET_SIZE.height / 2);
  });

  it("should keep the two rings apart so artifacts never collide when both are at the top", () => {
    const [inner, outer] = orbits;
    expect(inner && outer ? outer.ry - inner.ry : 0).toBeGreaterThanOrEqual(ARTIFACT_SIZE);
  });

  it("should space an orbit's artifacts evenly when they start", () => {
    const orbit = orbits[1];
    if (!orbit) throw new Error("missing orbit");
    const offsets = orbit.artifacts.map((_, index) => startOffset(orbit, index));
    const gaps = offsets.slice(1).map((offset, index) => (offsets[index] ?? 0) - offset);
    expect(new Set(gaps.map((gap) => gap.toFixed(6))).size).toBe(1);
  });

  it("should use ten different artifacts when both rings are counted", () => {
    expect(new Set(orbits.flatMap((orbit) => orbit.artifacts)).size).toBe(10);
  });
});

describe("stars", () => {
  it("should place every star inside the picture and off the planet when drawn", () => {
    for (const star of stars()) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x).toBeLessThanOrEqual(GALAXY_WIDTH);
      expect(star.y).toBeGreaterThanOrEqual(0);
      expect(star.y).toBeLessThanOrEqual(GALAXY_HEIGHT);
      const onPlanet = Math.abs(star.x - GALAXY_CENTER.x) < PLANET_SIZE.width / 2 && Math.abs(star.y - GALAXY_CENTER.y) < PLANET_SIZE.height / 2;
      expect(onPlanet).toBe(false);
    }
  });

  it("should draw the same sky when it renders twice", () => {
    expect(stars()).toEqual(stars());
  });
});
