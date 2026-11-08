import type { PixelIconName } from "./pixel-icons";

/**
 * The layout of the landing page's artifact galaxy: the brand planet in the
 * middle, artifacts on two elliptical orbits, and a scatter of stars. Pure
 * numbers in SVG user units, so the server and the browser draw the same
 * picture; the component animates the orbits.
 */

export const GALAXY_WIDTH = 1200;
export const GALAXY_HEIGHT = 900;
export const GALAXY_CENTER = { x: GALAXY_WIDTH / 2, y: GALAXY_HEIGHT / 2 } as const;

/** Each artifact is a 16-cell pixel icon drawn at this many units per cell. */
export const ARTIFACT_CELL = 6;
export const ARTIFACT_SIZE = 16 * ARTIFACT_CELL;

/** The planet is the 27 by 20 brand mark at this many units per cell. */
export const PLANET_CELL = 12;
export const PLANET_SIZE = { width: 27 * PLANET_CELL, height: 20 * PLANET_CELL } as const;

export interface Orbit {
  id: "inner" | "outer";
  rx: number;
  ry: number;
  /** Seconds for one full turn. */
  period: number;
  /** Counter-clockwise when true, so the two rings turn against each other. */
  reverse: boolean;
  artifacts: readonly PixelIconName[];
}

export const orbits: readonly Orbit[] = [
  { id: "inner", rx: 330, ry: 205, period: 90, reverse: true, artifacts: ["code", "chat", "chart", "checklist"] },
  { id: "outer", rx: 520, ry: 330, period: 140, reverse: false, artifacts: ["plan", "image", "pie", "terminal", "flow", "sheet"] },
];

/** An SVG path that traces an orbit once, starting at its left end, for animateMotion. */
export function orbitPath({ rx, ry }: Pick<Orbit, "rx" | "ry">): string {
  const { x, y } = GALAXY_CENTER;
  return `M${String(x - rx)} ${String(y)}a${String(rx)} ${String(ry)} 0 1 0 ${String(2 * rx)} 0a${String(rx)} ${String(ry)} 0 1 0 ${String(-2 * rx)} 0`;
}

/** How far into its orbit an artifact starts, in seconds, so the orbit's artifacts sit evenly spaced. */
export function startOffset(orbit: Orbit, index: number): number {
  return -(orbit.period * index) / orbit.artifacts.length;
}

export interface Star {
  x: number;
  y: number;
  /** Plus-shaped stars twinkle; dots stay still. */
  twinkle: boolean;
}

/** A stable 0-1 value per index, so the stars look scattered but never move between renders. */
function noise(seed: number): number {
  const n = Math.sin(seed * 12.9898) * 43758.5453;
  return n - Math.floor(n);
}

/** Stars snapped to the 6-unit pixel grid, kept off the planet. */
export function stars(count = 46): Star[] {
  const result: Star[] = [];
  for (let index = 0; index < count; index++) {
    const x = Math.round((noise(index + 1) * (GALAXY_WIDTH - 24) + 12) / 6) * 6;
    const y = Math.round((noise(index + 101) * (GALAXY_HEIGHT - 24) + 12) / 6) * 6;
    const nearPlanet = Math.abs(x - GALAXY_CENTER.x) < PLANET_SIZE.width / 2 + 24 && Math.abs(y - GALAXY_CENTER.y) < PLANET_SIZE.height / 2 + 24;
    if (!nearPlanet) result.push({ x, y, twinkle: index % 5 === 0 });
  }
  return result;
}
