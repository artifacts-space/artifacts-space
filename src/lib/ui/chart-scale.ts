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

function bounds(values: readonly (number | null)[]): [number, number] {
  let low = 0;
  let high = 0;
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) continue;
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  return low === high ? [low, low + 1] : [low, high];
}

/**
 * Builds a value axis that always includes zero, with about `tickCount` evenly
 * spaced, rounded ticks. Safe for empty data, all-null data, a single value,
 * negatives, and values near the largest double (no step ever overflows).
 */
export function niceScale(values: readonly (number | null)[], tickCount = 4): ChartScale {
  const [low, high] = bounds(values);
  // Divide before subtracting so huge opposite-signed values cannot overflow.
  const step = niceStep(high / tickCount - low / tickCount);
  const min = Number.isFinite(Math.floor(low / step) * step) ? Math.floor(low / step) * step : low;
  const max = Number.isFinite(Math.ceil(high / step) * step) ? Math.ceil(high / step) * step : high;
  const ticks: number[] = [];
  for (let index = 0; index <= maxTicks; index += 1) {
    const tick = min + index * step;
    if (!Number.isFinite(tick) || tick > max + step / 1e6) break;
    ticks.push(Math.abs(tick) < step / 1e9 ? 0 : tick);
  }
  return { min, max, ticks };
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
