/**
 * Version of the stout component set. A spec records the version it was
 * written for in its top-level `version` field.
 *
 * Changes to the component set are additive: new components and new optional
 * props never change what an existing spec means. When a change must alter
 * existing props, bump this number and add a step to `uiSpecMigrations` that
 * rewrites a spec from the previous version to the new one.
 */
export const UI_SPEC_VERSION = 1;

/** One migration step: rewrites a spec written for `from` into `from + 1`. */
export interface UiSpecMigration {
  from: number;
  migrate: (spec: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Ordered migration steps. Empty while only version 1 exists.
 * Example for a future version 2:
 * `{ from: 1, migrate: (spec) => renameProp(spec, "Metric", "change", "delta") }`
 */
export const uiSpecMigrations: readonly UiSpecMigration[] = [];

/**
 * Brings a spec from `fromVersion` up to `UI_SPEC_VERSION` by running each
 * migration step in order. Returns the spec unchanged when it is current.
 */
export function migrateUiSpec(spec: Record<string, unknown>, fromVersion: number): Record<string, unknown> {
  let current = spec;
  for (let version = fromVersion; version < UI_SPEC_VERSION; version += 1) {
    const step = uiSpecMigrations.find((migration) => migration.from === version);
    if (step) current = step.migrate(current);
  }
  return { ...current, version: UI_SPEC_VERSION };
}
