import type { LabelCounts } from "./template-frames";

/*
 * What the templates behavior spec concludes from its readings of a frame.
 * Pure, so a unit test shows each check can fail (template-readings.test.ts).
 */

/** The most times each label was drawn over several readings of one frame: at rest, and after each press that opens something. */
export function mostOf(readings: readonly LabelCounts[]): LabelCounts {
  const most: LabelCounts = { actions: {}, pictures: {} };
  for (const kind of ["actions", "pictures"] as const) {
    for (const reading of readings) {
      for (const [label, count] of Object.entries(reading[kind])) most[kind][label] = Math.max(most[kind][label] ?? 0, count);
    }
  }
  return most;
}

/**
 * Link and button labels a reader reaches in the `wide` frame and never in
 * the `narrow` one, at rest or with a panel open. `allowed` names labels
 * left out on purpose, each with its reason.
 */
export function unreachableIn(narrow: LabelCounts, wide: LabelCounts, allowed: Readonly<Record<string, string>> = {}): string[] {
  return Object.keys(wide.actions).filter((label) => (wide.actions[label] ?? 0) > 0 && (narrow.actions[label] ?? 0) === 0 && allowed[label] === undefined);
}

/**
 * Labels drawn more often in the `middle` frame than in any of the `ends`,
 * each with its count: a part shown twice between two width steps, which is
 * what hide steps that differ produce.
 */
export function drawnMoreThan(middle: LabelCounts, ends: readonly LabelCounts[]): string[] {
  return (["actions", "pictures"] as const).flatMap((kind) =>
    Object.entries(middle[kind])
      .filter(([label, count]) => count > Math.max(0, ...ends.map((end) => end[kind][label] ?? 0)))
      .map(([label, count]) => `"${label}" (${count === 1 ? "once" : `${String(count)} times`})`),
  );
}
