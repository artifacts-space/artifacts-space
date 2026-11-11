import { index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { artifact, user } from "./schema";

/*
 * Edit leases (src/lib/edits): while a person types in an artifact in the web
 * editor, their editor renews a lease about every 20 seconds, and it lasts
 * about a minute from the last renewal. While one is live, an agent save that
 * does not name the version it read (no `baseVersion`) is refused, so an older
 * agent client cannot overwrite what the person is typing. Only the web app
 * writes leases, from a signed-in session, so every lease is a person's.
 */
export const artifactEditLease = pgTable(
  "artifact_edit_lease",
  {
    artifactId: text("artifact_id").notNull().references(() => artifact.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    // Set from the database clock on every renewal: now() plus the lease length.
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.artifactId, table.userId] }), index("artifact_edit_lease_expires_idx").on(table.expiresAt)],
);
