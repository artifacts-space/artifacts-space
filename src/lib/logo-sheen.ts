/*
 * Geometry for the travelling highlight on the logo ring (src/components/logo.tsx).
 */

/** The ring's cells in grid units, one unit per pixel of the 27 by 20 mark. */
export const RING = "M20 0h5v1h-5zM18 1h8v1h-8zM16 2h4v1h-4zM23 2h4v1h-4zM17 3h1v1h-1zM24 3h3v2h-3zM23 5h3v1h-3zM22 6h4v1h-4zM21 7h4v1h-4zM21 8h3v1h-3zM20 9h3v1h-3zM4 10h2v1h-2zM20 10h2v1h-2zM3 11h2v1h-2zM2 12h2v1h-2zM1 13h2v2h-2zM0 15h2v2h-2zM0 17h3v1h-3zM6 17h4v1h-4zM1 18h8v1h-8zM2 19h4v1h-4z";

/*
 * The ring seen face on: the static ring is this circle tilted away from the
 * viewer, an ellipse about the planet's centre (13.5, 10.5) whose long axis
 * points up and right at -34 degrees and whose short axis is 0.37 of it.
 * Angles below are around that circle, clockwise on screen from the long
 * axis's top-right end.
 */
export const RING_TILT = "translate(13.5 10.5) rotate(-34.04) scale(1 0.3714)";
export const SHEEN_RADIUS = 24;

/**
 * Two highlight bands on opposite sides of the ring, each a bright leading edge that
 * steps down through the mark's lighter blues to the ring's own blue. At the
 * top of the page both sit where the planet hides the ring, so the still mark
 * shows no highlight.
 */
export const SHEEN_BANDS: readonly { tone: string; from: number; to: number }[] = [118, 288].flatMap((lead) => [
  { tone: "mid", from: lead - 36, to: lead - 20 },
  { tone: "light", from: lead - 20, to: lead - 8 },
  { tone: "pale", from: lead - 8, to: lead },
]);

/** A pie slice of the face-on ring circle between two angles, in degrees, as an SVG path. */
export function sheenWedge(from: number, to: number, radius = SHEEN_RADIUS): string {
  const steps = Math.max(1, Math.ceil((to - from) / 4));
  const points = Array.from({ length: steps + 1 }, (_, index) => {
    const angle = ((from + ((to - from) * index) / steps) * Math.PI) / 180;
    return `${(radius * Math.cos(angle)).toFixed(2)} ${(radius * Math.sin(angle)).toFixed(2)}`;
  });
  return `M0 0L${points.join("L")}z`;
}
