/** A pie or donut slice before layout: its name, its value, and its label index (-1 for "Other"). */
export interface PieEntry {
  label: string;
  value: number;
  index: number;
}

/** A laid-out slice. Angles are radians clockwise from twelve o'clock. */
export interface PieSlice extends PieEntry {
  fraction: number;
  start: number;
  end: number;
}

/** Most slices a pie shows. More fold into "Other", one per categorical color. */
export const maxPieSlices = 8;

/** The name of the slice that collects the smallest values. */
export const otherLabel = "Other";

/**
 * Pairs labels with values, treating missing and negative values as zero.
 * With more than `max` entries, keeps the `max - 1` largest in their original
 * order and sums the rest into one "Other" slice at the end.
 */
export function foldPieEntries(labels: readonly string[], values: readonly (number | null)[], max = maxPieSlices): PieEntry[] {
  const entries = labels.map((label, index) => ({ label, value: Math.max(0, values[index] ?? 0), index }));
  if (entries.length <= max) return entries;
  const ranked = [...entries].sort((a, b) => b.value - a.value || a.index - b.index);
  const kept = new Set(ranked.slice(0, max - 1).map((entry) => entry.index));
  const rest = entries.filter((entry) => !kept.has(entry.index)).reduce((sum, entry) => sum + entry.value, 0);
  return [...entries.filter((entry) => kept.has(entry.index)), { label: otherLabel, value: rest, index: -1 }];
}

/**
 * Lays entries out around the circle in order, starting at twelve o'clock.
 * Fractions are computed against the largest value first, so huge values
 * cannot overflow the total. When every value is zero, every fraction is zero.
 */
export function pieSlices(entries: readonly PieEntry[]): PieSlice[] {
  const largest = entries.reduce((max, entry) => (Number.isFinite(entry.value) ? Math.max(max, entry.value) : max), 0);
  const scaled = entries.map((entry) => (largest > 0 && Number.isFinite(entry.value) ? entry.value / largest : 0));
  const total = scaled.reduce((sum, value) => sum + value, 0);
  let angle = 0;
  return entries.map((entry, index) => {
    const fraction = total > 0 ? (scaled[index] ?? 0) / total : 0;
    const start = angle;
    angle += fraction * Math.PI * 2;
    return { ...entry, fraction, start, end: angle };
  });
}

function point(center: number, radius: number, angle: number): string {
  const x = center + radius * Math.sin(angle);
  const y = center - radius * Math.cos(angle);
  return `${x.toFixed(3)} ${y.toFixed(3)}`;
}

function fullRing(center: number, outer: number, inner: number): string {
  const ring = (radius: number, sweep: 0 | 1) =>
    `M ${String(center - radius)} ${String(center)} A ${String(radius)} ${String(radius)} 0 1 ${String(sweep)} ${String(center + radius)} ${String(center)} A ${String(radius)} ${String(radius)} 0 1 ${String(sweep)} ${String(center - radius)} ${String(center)} Z`;
  return inner > 0 ? `${ring(outer, 1)} ${ring(inner, 0)}` : ring(outer, 1);
}

/**
 * SVG path data for one slice in a square of side `center * 2`. `inner` is
 * the hole radius (0 for a pie). A slice that fills the circle is drawn as a
 * full ring, which a single arc cannot express. Draw with fill-rule evenodd.
 */
export function slicePath(slice: Pick<PieSlice, "start" | "end">, center: number, outer: number, inner = 0): string {
  const sweep = slice.end - slice.start;
  if (sweep >= Math.PI * 2 - 1e-9) return fullRing(center, outer, inner);
  const large = sweep > Math.PI ? 1 : 0;
  const outerArc = `M ${point(center, outer, slice.start)} A ${String(outer)} ${String(outer)} 0 ${String(large)} 1 ${point(center, outer, slice.end)}`;
  if (inner <= 0) return `${outerArc} L ${String(center)} ${String(center)} Z`;
  return `${outerArc} L ${point(center, inner, slice.end)} A ${String(inner)} ${String(inner)} 0 ${String(large)} 0 ${point(center, inner, slice.start)} Z`;
}
