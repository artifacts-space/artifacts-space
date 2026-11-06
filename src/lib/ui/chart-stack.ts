/** One series' segment at one label: it spans `start` to `end` on the value axis. */
export interface StackSegment {
  start: number;
  end: number;
}

/** Stacked layout of several series over the same labels. */
export interface StackLayout {
  /** `segments[series][label]`. A missing value is a zero-height segment at the current offset. */
  segments: StackSegment[][];
  /** Sum of the values at each label, or null when every value there is missing. */
  totals: (number | null)[];
  /** Every segment end, for building the value axis. */
  extent: number[];
}

/**
 * Stacks series on top of each other, label by label. Positive values stack
 * up from zero and negative values stack down from zero, so mixed signs never
 * overlap. Missing values (null) add nothing. Sums past the largest double
 * become Infinity, which the scale clamps to the axis edge.
 */
export function stackSeries(series: readonly (readonly (number | null)[])[], count: number): StackLayout {
  const up = new Array<number>(count).fill(0);
  const down = new Array<number>(count).fill(0);
  const seen = new Array<boolean>(count).fill(false);
  const segments = series.map((values) =>
    Array.from({ length: count }, (_, index): StackSegment => {
      const value = values[index] ?? null;
      const offsets = value !== null && value < 0 ? down : up;
      const start = offsets[index] ?? 0;
      if (value === null) return { start, end: start };
      seen[index] = true;
      offsets[index] = start + value;
      return { start, end: start + value };
    }),
  );
  const totals = up.map((high, index) => (seen[index] ? high + (down[index] ?? 0) : null));
  return { segments, totals, extent: [...up, ...down] };
}
