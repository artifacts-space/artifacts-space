import { sql } from "drizzle-orm";

import { artifact } from "@/db/schema";

/**
 * Save times come from the database clock, never an app server's: every
 * server stamps the same clock, and a save is always later than the one
 * before it. `updated_at` (and `person_saved_at` for a person's save) is
 * the database time in whole milliseconds, and at least a millisecond after
 * the row's previous save, so two saves of one artifact never share a time.
 * Base versions (`baseVersion`, `expectedUpdatedAt`) carry milliseconds, so
 * this makes "still at the base" exact: a newer save can never look like
 * the one a base names. Use it only in an UPDATE of `artifact`, where
 * `artifact.updated_at` is the row's value before the save.
 */
export function nextSaveTime() {
  return sql<Date>`date_trunc('milliseconds', greatest(now(), ${artifact.updatedAt} + interval '1 millisecond'))`;
}

/** The save time of a new artifact: the database clock, in whole milliseconds. */
export function firstSaveTime() {
  return sql<Date>`date_trunc('milliseconds', now())`;
}

/**
 * SQL for a statement on another table: the artifact is still at the save
 * time `at`, so nothing saved after it. A save's later steps (its version,
 * its approval) run only while this holds, so a slower save never undoes
 * what a newer one already wrote. The artifact id is bound as a value.
 */
export function artifactStillAt(artifactId: string, at: Date) {
  return sql`exists (select 1 from ${artifact} saved_row where saved_row.id = ${artifactId} and date_trunc('milliseconds', saved_row.updated_at) = ${at.toISOString()}::timestamptz)`;
}
