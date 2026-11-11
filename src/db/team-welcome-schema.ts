import { index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { team, user } from "./schema";

/*
 * A member closed the welcome card in one team's workspace
 * (src/lib/teams/welcome.ts). One row per person and team, so the card
 * stays closed on every device. Only the card changes; access stays the same.
 */
export const teamWelcomeDismissal = pgTable(
  "team_welcome_dismissal",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    teamId: text("team_id").notNull().references(() => team.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Deleting a team removes its rows; the index keeps that from scanning every row.
  (table) => [primaryKey({ columns: [table.userId, table.teamId] }), index("team_welcome_dismissal_team_idx").on(table.teamId)],
);
