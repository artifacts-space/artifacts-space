type GridStep = (index: number, columns: number, last: number) => number;

const steps: Partial<Record<string, GridStep>> = {
  ArrowRight: (index, _columns, last) => Math.min(last, index + 1),
  ArrowLeft: (index) => Math.max(0, index - 1),
  ArrowDown: (index, columns, last) => (index + columns > last ? index : index + columns),
  ArrowUp: (index, columns) => (index - columns < 0 ? index : index - columns),
  Home: () => 0,
  End: (_index, _columns, last) => last,
};

/**
 * Keyboard movement in the icon picker's grid: arrows move by one cell or
 * one row, Home and End jump to the first and last icon. Moves stop at the
 * edges. Returns null for keys the grid does not handle.
 */
export function iconGridMove(index: number, key: string, columns: number, count: number): number | null {
  const step = steps[key];
  if (!step || count === 0 || columns < 1) return null;
  return step(index, columns, count - 1);
}
