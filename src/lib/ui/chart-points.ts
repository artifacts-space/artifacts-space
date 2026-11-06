/** A scatter point after flattening: which series it belongs to and its data. */
export interface PlotPoint {
  series: number;
  x: number;
  y: number;
  label?: string | undefined;
}

/** Flattens series of points into one list ordered by x, then y, for keyboard reading. */
export function flattenPoints(series: readonly { points: readonly { x: number; y: number; label?: string | undefined }[] }[]): PlotPoint[] {
  const points = series.flatMap((item, index) => item.points.map((point) => ({ series: index, x: point.x, y: point.y, label: point.label })));
  return points.sort((a, b) => a.x - b.x || a.y - b.y || a.series - b.series);
}

/**
 * Index of the point nearest (`x`, `y`), where each point is given as its
 * position in the same units. Returns -1 for an empty list.
 */
export function nearestIndex(positions: readonly (readonly [number, number])[], x: number, y: number): number {
  let best = -1;
  let bestDistance = Infinity;
  positions.forEach(([px, py], index) => {
    const distance = (px - x) ** 2 + (py - y) ** 2;
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/** A sparkline drawn in a `width` × `height` box: runs of points (gaps split runs) and the last point. */
export interface SparklineShape {
  runs: [number, number][][];
  last: [number, number] | null;
}

function sparkRange(values: readonly (number | null)[]): [number, number] | null {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (finite.length < 2) return null;
  return [Math.min(...finite), Math.max(...finite)];
}

/**
 * Places sparkline values in a box, from the lowest value at the bottom to
 * the highest at the top. A flat series sits in the middle. Needs at least two
 * numbers; otherwise returns no runs. Halves before subtracting so huge
 * opposite-signed values cannot overflow.
 */
export function sparklineShape(values: readonly (number | null)[], width: number, height: number): SparklineShape {
  const range = sparkRange(values);
  if (!range) return { runs: [], last: null };
  const [low, high] = range;
  const span = high / 2 - low / 2;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const runs: [number, number][][] = [];
  let current: [number, number][] = [];
  let last: [number, number] | null = null;
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      if (current.length > 0) runs.push(current);
      current = [];
      return;
    }
    const position = span > 0 ? (value / 2 - low / 2) / span : 0.5;
    last = [index * step, height - position * height];
    current.push(last);
  });
  if (current.length > 0) runs.push(current);
  return { runs, last };
}
