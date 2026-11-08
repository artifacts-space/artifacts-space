import { inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { notificationSetting } from "@/db/notification-schema";

import { readPreferences, type NotificationPreferences } from "./preference-rules";

/** Settings for these people, by id. Anyone without a stored row gets the defaults. */
export async function loadPreferences(userIds: readonly string[]): Promise<Map<string, NotificationPreferences>> {
  const ids = [...new Set(userIds)];
  const byUser = new Map<string, NotificationPreferences>();
  if (ids.length === 0) return byUser;
  const rows = await getDb().select().from(notificationSetting).where(inArray(notificationSetting.userId, ids));
  const stored = new Map(rows.map((row) => [row.userId, row.preferences]));
  for (const id of ids) byUser.set(id, readPreferences(stored.get(id)));
  return byUser;
}

/** One person's settings, with defaults. */
export async function loadPreferencesFor(userId: string): Promise<NotificationPreferences> {
  return (await loadPreferences([userId])).get(userId) ?? readPreferences(undefined);
}

/** Stores a person's settings. Callers validate them first (readPreferences does). */
export async function savePreferences(userId: string, preferences: NotificationPreferences): Promise<void> {
  await getDb()
    .insert(notificationSetting)
    .values({ userId, preferences: { ...preferences } })
    .onConflictDoUpdate({ target: notificationSetting.userId, set: { preferences: { ...preferences }, updatedAt: sql`now()` } });
}
