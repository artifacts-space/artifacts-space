import { z } from "zod";

import { describeWait } from "@/lib/abuse/rate-limit-window";

import { oauthLimits } from "./config";

/**
 * Pure rules for the registration endpoint's pool limits
 * (src/lib/oauth/registration-limits.ts). A registration writes one app row
 * and one resource link; apps nobody approves are deleted after
 * oauthLimits.unapprovedClientHours by the cleanup job, so what one address
 * can fill is the pool of unapproved apps, and that is what these cap, in
 * all and per network. A full share or pool makes room by evicting its
 * oldest unapproved app past the grace period; it refuses only when nothing
 * is old enough.
 */

/** Unapproved apps within the cleanup window, as the registration limits see them. */
export interface UnapprovedClientCounts {
  /** Every unapproved app in the window. */
  total: number;
  /** Unapproved apps a new registration could evict: past the grace period, from no metadata document, holding no tokens. */
  evictable: number;
  /** When the oldest unapproved app still inside the grace period was registered. */
  oldestInGrace: Date | null;
  /** This network's unapproved apps that still carry its tag. */
  fromNetwork: number;
  /** Of those, the ones a new registration from this network could evict. */
  evictableFromNetwork: number;
  /** When this network's oldest app still inside the grace period was registered. */
  oldestInGraceFromNetwork: Date | null;
}

/** Why a registration is refused before Better Auth stores it. */
export type PoolRefusal =
  | { status: 429; error: "rate_limited"; description: string; retryAfterSeconds: number }
  | { status: 503; error: "temporarily_unavailable"; description: string; retryAfterSeconds: number };

/** Seconds until the oldest app inside the grace period leaves it and becomes evictable, from a minute up to the grace period. */
export function graceWait(oldestInGrace: Date | null, nowMs: number): number {
  const graceSeconds = oauthLimits.unapprovedEvictionGraceMinutes * 60;
  if (!oldestInGrace) return graceSeconds;
  const freeAtMs = oldestInGrace.getTime() + graceSeconds * 1000;
  return Math.min(graceSeconds, Math.max(60, Math.ceil((freeAtMs - nowMs) / 1000)));
}

/** The 503 for a full pool with nothing old enough to evict. */
export function fullPoolRefusal(retryAfterSeconds: number): PoolRefusal {
  const description = `Too many apps are waiting for approval. Try again in ${describeWait(retryAfterSeconds)}.`;
  return { status: 503, error: "temporarily_unavailable", description, retryAfterSeconds };
}

/** The 429 for a network whose share of unapproved apps is full with nothing old enough to evict. */
export function networkShareRefusal(retryAfterSeconds: number): PoolRefusal {
  const description = `Your network has registered a lot of apps in the last few minutes that nobody has approved yet. Try again in ${describeWait(retryAfterSeconds)}.`;
  return { status: 429, error: "rate_limited", description, retryAfterSeconds };
}

/**
 * Refuses a registration only when no app could make room for it: this
 * network holds its share of unapproved apps and every one of them is inside
 * the grace period or cannot be evicted (429, until its oldest leaves the
 * grace period), or the whole pool is full the same way (503). Otherwise the
 * registration goes on and the route evicts the oldest app past the grace
 * period, the network's own first. Approved apps never count, so a hosted
 * app whose people finish connecting is limited only by the hourly limit.
 */
export function registrationPoolRefusal(counts: UnapprovedClientCounts, nowMs: number): PoolRefusal | null {
  if (counts.fromNetwork >= oauthLimits.maxUnapprovedClientsPerNetwork && counts.evictableFromNetwork === 0) {
    return networkShareRefusal(graceWait(counts.oldestInGraceFromNetwork, nowMs));
  }
  if (counts.total >= oauthLimits.maxUnapprovedClients && counts.evictable === 0) return fullPoolRefusal(graceWait(counts.oldestInGrace, nowMs));
  return null;
}

const registeredSchema = z.object({ client_id: z.string().min(1).max(2048) });

/** The client id in a successful registration answer (RFC 7591 §3.2.1), or null. */
export function registeredClientId(body: unknown): string | null {
  const parsed = registeredSchema.safeParse(body);
  return parsed.success ? parsed.data.client_id : null;
}
