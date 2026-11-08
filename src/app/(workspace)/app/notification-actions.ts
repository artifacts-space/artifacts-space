"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/artifact-types";
import { countUnreadNotifications, listNotifications, markNotificationsRead, type NotificationView } from "@/lib/notifications/feed";
import { changePreference, type NotificationPreferences } from "@/lib/notifications/preference-rules";
import { loadPreferencesFor, savePreferences } from "@/lib/notifications/preferences";
import { notificationChannels, notificationEvents } from "@/lib/notifications/types";
import { getSession } from "@/lib/session";

/**
 * The bell and notification settings. They never redirect: the bell calls
 * them on focus, so a signed-out tab gets a plain error and keeps its state.
 */

const signInMessage = "Sign in to see your notifications.";
const idsSchema = z.array(z.string().trim().min(1).max(200)).max(100);

async function viewerId() {
  const session = await getSession();
  return session?.user.id ?? null;
}

/** The bell's list, newest first, with the unread count. */
export interface NotificationFeed {
  items: NotificationView[];
  unread: number;
}

/** Loads the bell's list. */
export async function loadNotificationsAction(): Promise<ActionResult<NotificationFeed>> {
  try {
    const userId = await viewerId();
    if (!userId) return { success: false, error: signInMessage };
    const [items, unread] = await Promise.all([listNotifications(userId), countUnreadNotifications(userId)]);
    return { success: true, data: { items, unread } };
  } catch {
    return { success: false, error: "Notifications could not be loaded. Please try again." };
  }
}

/** The unread count only, for the bell's badge when the tab comes back into view. */
export async function countNotificationsAction(): Promise<ActionResult<number>> {
  try {
    const userId = await viewerId();
    if (!userId) return { success: false, error: signInMessage };
    return { success: true, data: await countUnreadNotifications(userId) };
  } catch {
    return { success: false, error: "Notifications could not be loaded." };
  }
}

/** Marks notifications read, by id or all at once. Returns how many changed. */
export async function markNotificationsReadAction(ids: string[] | "all"): Promise<ActionResult<number>> {
  try {
    const userId = await viewerId();
    if (!userId) return { success: false, error: signInMessage };
    const changed = await markNotificationsRead(userId, ids === "all" ? "all" : idsSchema.parse(ids));
    return { success: true, data: changed };
  } catch {
    return { success: false, error: "Notifications could not be marked read. Please try again." };
  }
}

const preferenceSchema = z.object({ event: z.enum(notificationEvents), channel: z.enum(notificationChannels), on: z.boolean() });

/** Turns one channel of one event on or off. Returns the saved settings. */
export async function setNotificationPreferenceAction(input: z.input<typeof preferenceSchema>): Promise<ActionResult<NotificationPreferences>> {
  try {
    const userId = await viewerId();
    if (!userId) return { success: false, error: signInMessage };
    const { event, channel, on } = preferenceSchema.parse(input);
    const next = changePreference(await loadPreferencesFor(userId), event, channel, on);
    await savePreferences(userId, next);
    return { success: true, data: next };
  } catch {
    return { success: false, error: "The setting could not be saved. Please try again." };
  }
}
