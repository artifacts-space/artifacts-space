import { date, index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

// Relative import: drizzle-kit loads this file without the "@/" alias.
import { artifact } from "./schema";

/*
 * Cookieless view counts for public artifacts (src/lib/views). Only daily
 * totals and referrer domains are kept. No address, user agent, cookie, or
 * full URL is ever stored. Days are UTC dates.
 */

// Views and unique visitors of one artifact on one day.
export const artifactViewDay = pgTable(
  "artifact_view_day",
  {
    artifactId: text("artifact_id").notNull().references(() => artifact.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    views: integer("views").notNull().default(0),
    visitors: integer("visitors").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.artifactId, table.day] })],
);

// Views that came from another site, by domain only (never a path: artifact URLs are capability URLs).
export const artifactViewReferrer = pgTable(
  "artifact_view_referrer",
  {
    artifactId: text("artifact_id").notNull().references(() => artifact.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    domain: text("domain").notNull(),
    views: integer("views").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.artifactId, table.day, table.domain] })],
);

// Today's visitor hashes, only to count each visitor once a day. The hash is
// keyed with a salt that changes every day, and earlier days are deleted on
// the next write, so visitors cannot be followed from one day to the next.
export const artifactViewVisitor = pgTable(
  "artifact_view_visitor",
  {
    artifactId: text("artifact_id").notNull().references(() => artifact.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    visitor: text("visitor").notNull(),
  },
  (table) => [primaryKey({ columns: [table.artifactId, table.day, table.visitor] }), index("artifact_view_visitor_day_idx").on(table.day)],
);
