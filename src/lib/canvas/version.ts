/**
 * Version of the canvas format: the board and its frame fields. Each frame's
 * `spec` carries its own ui version (`UI_SPEC_VERSION`), which changes
 * separately.
 *
 * Changes are additive: a new optional frame field never changes what an
 * existing canvas means. When a change must alter existing fields, bump this
 * number and add a step to `canvasMigrations`.
 */
export const CANVAS_VERSION = 1;

/** One migration step: rewrites a canvas written for `from` into `from + 1`. */
export interface CanvasMigration {
  from: number;
  migrate: (canvas: Record<string, unknown>) => Record<string, unknown>;
}

/** Ordered migration steps. Empty while only version 1 exists. */
export const canvasMigrations: readonly CanvasMigration[] = [];

/**
 * Brings a canvas from `fromVersion` up to `CANVAS_VERSION` by running each
 * migration step in order. Returns it unchanged, with the current version,
 * when it is current.
 */
export function migrateCanvas(canvas: Record<string, unknown>, fromVersion: number, steps: readonly CanvasMigration[] = canvasMigrations): Record<string, unknown> {
  let current = canvas;
  for (let version = fromVersion; version < CANVAS_VERSION; version += 1) {
    const step = steps.find((migration) => migration.from === version);
    if (step) current = step.migrate(current);
  }
  return { ...current, version: CANVAS_VERSION };
}
