import { describe, expect, it } from "vitest";

import { RING, SHEEN_BANDS, sheenWedge } from "./logo-sheen";

const CENTRE = { x: 13.5, y: 10.5 };
const TILT = (-34.04 * Math.PI) / 180;
const SQUASH = 0.3714;

/** Every sample point (corners, edge midpoints, centre) of every ring cell, in grid units. */
function ringSamples(): { x: number; y: number }[] {
  const samples: { x: number; y: number }[] = [];
  for (const [, x, y, w, h] of RING.matchAll(/M(\d+) (\d+)h(\d+)v(\d+)/g)) {
    for (let cx = Number(x); cx < Number(x) + Number(w); cx++) {
      for (let cy = Number(y); cy < Number(y) + Number(h); cy++) {
        for (const dx of [0.02, 0.5, 0.98]) for (const dy of [0.02, 0.5, 0.98]) samples.push({ x: cx + dx, y: cy + dy });
      }
    }
  }
  return samples;
}

/** The angle, in degrees from 0 to 360, of a mark point around the face-on ring circle. */
function faceOnAngle({ x, y }: { x: number; y: number }): number {
  const dx = x - CENTRE.x;
  const dy = y - CENTRE.y;
  const u = dx * Math.cos(-TILT) - dy * Math.sin(-TILT);
  const v = (dx * Math.sin(-TILT) + dy * Math.cos(-TILT)) / SQUASH;
  return ((Math.atan2(v, u) * 180) / Math.PI + 360) % 360;
}

/** How many ring sample points the bands light when they have turned by `turn` degrees. */
function litSamples(turn: number): number {
  return ringSamples().filter((point) => {
    const angle = faceOnAngle(point);
    return SHEEN_BANDS.some(({ from, to }) => {
      const start = (((from + turn) % 360) + 360) % 360;
      const span = to - from;
      return (angle - start + 360) % 360 <= span;
    });
  }).length;
}

describe("logo ring sheen", () => {
  it("should light no ring cell when the page is at the top", () => {
    expect(litSamples(0)).toBe(0);
  });

  it("should light part of the ring when the bands have turned onto it", () => {
    expect(litSamples(60)).toBeGreaterThan(0);
    expect(litSamples(180)).toBeGreaterThan(0);
  });

  it("should give each band a bright leading edge that steps down to the ring's blue when listed in order", () => {
    expect(SHEEN_BANDS.map(({ tone }) => tone)).toEqual(["mid", "light", "pale", "mid", "light", "pale"]);
    for (let index = 1; index < SHEEN_BANDS.length; index++) {
      const previous = SHEEN_BANDS[index - 1];
      const current = SHEEN_BANDS[index];
      if (!previous || !current || current.tone === "mid") continue;
      expect(current.from, "steps within a band touch").toBe(previous.to);
    }
  });

  it("should draw a closed pie slice from the centre when given two angles", () => {
    const path = sheenWedge(0, 90, 10);
    expect(path.startsWith("M0 0L10.00 0.00")).toBe(true);
    expect(path.endsWith("L0.00 10.00z")).toBe(true);
  });
});
