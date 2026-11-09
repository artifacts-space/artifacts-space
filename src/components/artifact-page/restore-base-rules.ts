/**
 * The save time History's restore checks against. The editor's copy starts
 * at its own save time; cover, icon, and theme changes from this page save
 * through their own actions and report the time they moved the artifact
 * from and to. Following that chain moves the base across this page's own
 * saves only: a save by someone else in between breaks the chain, so the
 * restore still waits for the person to see it.
 */
export function ownSaveBase(start: string, ownSaves: ReadonlyMap<string, string>): string {
  let current = start;
  // Each step moves forward in time, so the chain ends; the cap guards against a bad entry.
  for (let step = 0; step < ownSaves.size; step++) {
    const next = ownSaves.get(current);
    if (next === undefined || next === current) return current;
    current = next;
  }
  return current;
}
