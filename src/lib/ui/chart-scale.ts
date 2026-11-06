/** A value axis: its bounds and the tick values between them. */
export interface ChartScale {
  min: number;
  max: number;
  ticks: number[];
}

const maxTicks = 12;

/** Rounds a raw step up to 1, 2, 5, or 10 times a power of ten. */
function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const exponent = Math.floor(Math.log10(raw));
  const base = 10 ** exponent;
  const fraction = raw / base;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  const step = nice * base;
  return Number.isFinite(step) && step > 0 ? step : raw;
}

/** Options for `niceScale`. */
export interface ScaleOptions {
  /** Stretch the axis to include zero. Default true (bars and areas need it; scatter and sparklines do not). */
  includeZero?: boolean;
}

function finiteBounds(values: readonly (number | null)[], includeZero: boolean): [number, number] | null {
  let low = includeZero ? 0 : Infinity;
  let high = includeZero ? 0 : -Infinity;
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) continue;
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  return low <= high ? [low, high] : null;
}

function bounds(values: readonly (number | null)[], includeZero: boolean): [number, number] {
  const found = finiteBounds(values, includeZero);
  if (!found) return [0, 1];
  const [low, high] = found;
  if (low !== high) return [low, high];
  if (includeZero) return [low, low + 1];
  // One distinct value away from zero: pad by a tenth of its size so the step stays meaningful.
  const pad = low === 0 ? 1 : Math.abs(low) / 10;
  return [low - pad, high + pad];
}

/**
 * Builds a value axis with about `tickCount` evenly spaced, rounded ticks.
 * It includes zero unless `includeZero` is false. Safe for empty data,
 * all-null data, a single value, negatives, and values near the largest
 * double (no step ever overflows).
 */
export function niceScale(values: readonly (number | null)[], tickCount = 4, options: ScaleOptions = {}): ChartScale {
  const [low, high] = bounds(values, options.includeZero ?? true);
  // Divide before subtracting so huge opposite-signed values cannot overflow.
  const step = niceStep(high / tickCount - low / tickCount);
  const min = Number.isFinite(Math.floor(low / step) * step) ? Math.floor(low / step) * step : low;
  const max = Number.isFinite(Math.ceil(high / step) * step) ? Math.ceil(high / step) * step : high;
  return { min, max, ticks: ticksBetween(min, max, step) };
}

function ticksBetween(min: number, max: number, step: number): number[] {
  const ticks: number[] = [];
  for (let index = 0; index <= maxTicks; index += 1) {
    const tick = min + index * step;
    const snapped = Math.abs(tick) < step / 1e9 ? 0 : tick;
    // Steps far below the bounds' precision stop moving: stop rather than repeat a tick.
    if (!Number.isFinite(tick) || tick > max + step / 1e6 || snapped === ticks.at(-1)) break;
    ticks.push(snapped);
  }
  return ticks;
}

/**
 * Where `value` sits between `min` (0) and `max` (1). Halves before
 * subtracting so the span cannot overflow; clamps to the axis.
 */
export function scalePosition(value: number, scale: ChartScale): number {
  const span = scale.max / 2 - scale.min / 2;
  if (!(span > 0)) return 0;
  const position = (value / 2 - scale.min / 2) / span;
  return Math.min(1, Math.max(0, position));
}

/** Indexes of at most `limit` labels to show, evenly spread and always including the first and last. */
export function visibleLabelIndexes(count: number, limit: number): number[] {
  if (count <= 0) return [];
  if (count <= limit) return Array.from({ length: count }, (_, index) => index);
  const every = Math.ceil((count - 1) / (limit - 1));
  const indexes: number[] = [];
  for (let index = 0; index < count - 1; index += every) indexes.push(index);
  if (count - 1 - (indexes.at(-1) ?? 0) < every / 2) indexes.pop();
  indexes.push(count - 1);
  return indexes;
}

/**
 * The widest an x-axis label may be, as a fraction of the axis, so labels at
 * `positions` (sorted, 0 to 1) never overlap. Centered labels may fill the
 * smallest gap; spread labels (shifted by their position) need a little less.
 */
export function tickLabelWidth(positions: readonly number[], anchor: "center" | "spread"): number {
  if (positions.length < 2) return 1;
  let gap = 1;
  for (let index = 1; index < positions.length; index += 1) {
    gap = Math.min(gap, (positions[index] ?? 1) - (positions[index - 1] ?? 0));
  }
  if (!(gap > 0)) return 0;
  return anchor === "center" ? gap : gap / (1 + gap);
}
