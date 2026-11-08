import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { pushSubscription, type PushSubscriptionRecord } from "@/db/notification-schema";
import { UserFacingError } from "@/lib/user-facing-error";

import { deviceLabel, isAllowedPushEndpoint, MAX_DEVICES } from "./push-rules";

/** Browsers that receive a person's browser notifications. */

/** One browser as settings lists it. The push address and keys never leave the server. */
export interface PushDeviceView {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  /** A short SHA-256 of the push address, so a browser can tell which row is itself (endpointKey). */
  key: string;
}

/** The short hash a browser compares with its own push address. Same as endpointKey in the browser. */
export function endpointKey(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 16);
}

const base64url = z.string().trim().regex(/^[A-Za-z0-9_-]+={0,2}$/);

/** A subscription as the browser hands it over (PushSubscription.toJSON()). */
export const subscriptionSchema = z.object({
  endpoint: z.string().trim().min(1).refine(isAllowedPushEndpoint, "This browser's push service is not supported."),
  keys: z.object({ p256dh: base64url.min(80).max(100), auth: base64url.min(16).max(32) }),
});

function toView(row: PushSubscriptionRecord): PushDeviceView {
  return { id: row.id, label: row.label || "Browser", createdAt: row.createdAt.toISOString(), lastUsedAt: row.lastUsedAt?.toISOString() ?? null, key: endpointKey(row.endpoint) };
}

/** A person's browsers, newest first. */
export async function listDevices(userId: string): Promise<PushDeviceView[]> {
  const rows = await getDb().select().from(pushSubscription).where(eq(pushSubscription.userId, userId)).orderBy(desc(pushSubscription.createdAt));
  return rows.map(toView);
}

/** The full subscriptions for these people, for sending. Server only. */
export async function subscriptionsFor(userIds: readonly string[]): Promise<PushSubscriptionRecord[]> {
  if (userIds.length === 0) return [];
  return getDb().select().from(pushSubscription).where(inArray(pushSubscription.userId, [...new Set(userIds)]));
}

/** Keeps the newest MAX_DEVICES browsers and removes the rest. */
async function keepNewest(userId: string) {
  const keep = await getDb().select({ id: pushSubscription.id }).from(pushSubscription).where(eq(pushSubscription.userId, userId)).orderBy(desc(pushSubscription.createdAt)).limit(MAX_DEVICES);
  if (keep.length < MAX_DEVICES) return;
  await getDb().delete(pushSubscription).where(and(eq(pushSubscription.userId, userId), notInArray(pushSubscription.id, keep.map((row) => row.id))));
}

/**
 * Saves this browser for the person. A browser has one push address; if
 * another account subscribed on it before, it now belongs to this person, so
 * the earlier account's notifications stop showing here.
 */
export async function saveDevice(userId: string, input: unknown, userAgent: string | null): Promise<PushDeviceView> {
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) throw new UserFacingError(parsed.error.issues[0]?.message ?? "This browser could not be set up for notifications.");
  const { endpoint, keys } = parsed.data;
  const values = { userId, p256dh: keys.p256dh, auth: keys.auth, label: deviceLabel(userAgent).slice(0, 100) };
  const [row] = await getDb()
    .insert(pushSubscription)
    .values({ id: randomUUID(), endpoint, ...values })
    .onConflictDoUpdate({ target: pushSubscription.endpoint, set: { ...values, createdAt: sql`now()`, lastUsedAt: null } })
    .returning();
  if (!row) throw new Error("The browser could not be saved.");
  await keepNewest(userId);
  return toView(row);
}

/** Removes one of the person's browsers by id. Returns false when it was not theirs or is already gone. */
export async function removeDevice(userId: string, id: string): Promise<boolean> {
  const removed = await getDb().delete(pushSubscription).where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.id, id))).returning();
  return removed.length > 0;
}

/** Removes the person's subscription for one push address (this browser turning off). */
export async function removeDeviceByEndpoint(userId: string, endpoint: string): Promise<void> {
  await getDb().delete(pushSubscription).where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)));
}

/** Drops subscriptions the push service says are gone (404 or 410). */
export async function pruneDevices(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await getDb().delete(pushSubscription).where(inArray(pushSubscription.id, [...ids]));
}

/** Records that these browsers took a notification. */
export async function touchDevices(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await getDb().update(pushSubscription).set({ lastUsedAt: sql`now()` }).where(inArray(pushSubscription.id, [...ids]));
}
