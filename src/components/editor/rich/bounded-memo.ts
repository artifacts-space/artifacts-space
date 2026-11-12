/** Looks up `key`, computing and remembering its value on a miss. */
export type BoundedMemo = (key: string, compute: () => string) => string;

/**
 * A string memo that holds at most `budget` characters of keys and values,
 * dropping the least recently used entries first. An entry larger than the
 * whole budget is computed but never kept.
 */
export function boundedMemo(budget: number): BoundedMemo {
  const entries = new Map<string, string>();
  let size = 0;

  const evictUntilFits = () => {
    for (const [key, value] of entries) {
      if (size <= budget) return;
      entries.delete(key);
      size -= key.length + value.length;
    }
  };

  return (key, compute) => {
    const known = entries.get(key);
    if (known !== undefined) {
      entries.delete(key);
      entries.set(key, known);
      return known;
    }
    const value = compute();
    const cost = key.length + value.length;
    if (cost > budget) return value;
    entries.set(key, value);
    size += cost;
    evictUntilFits();
    return value;
  };
}
