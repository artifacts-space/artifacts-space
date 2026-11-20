import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

// A person chose "Don't ask again" for one kind of destructive confirmation.
// Only the dialog changes; server checks stay the same.
export const confirmationSkip = pgTable(
  "confirmation_skip",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.action] })],
);
