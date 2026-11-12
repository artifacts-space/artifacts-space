import { z } from "zod";

import { describeWait } from "@/lib/abuse/rate-limit-window";

import { oauthLimits } from "./config";

/**
 * Pure rules for the registration endpoint's pool limits
 * (src/lib/oauth/registration-limits.ts). A registration writes one app row
 * and one resource link; apps nobody approves are deleted after
 * oauthLimits.unapprovedClientHours by the cleanup job, so what one address
 * can fill is the pool of unapproved apps, and that is what these cap. A full
 * pool makes room by evicting its oldest unapproved app past the grace
 * period; it refuses only when every unapproved app is younger than that.
 */

/** Unapproved apps within the cleanup window, as the registration limits see them. */
export interface UnapprovedClientCounts {
  /** Every unapproved app in the window. */
  total: number;
  /** This network's unapproved apps still stored. */
  fromNetwork: number;
  /** This network's apps evicted unapproved in the last day; they keep counting. */
  evictedFromNetwork: number;
  /** When this network's oldest stored unapproved app was registered. */
  oldestFromNetwork: Date | null;
  /** Unapproved apps a new registration could evict: past the grace period, and not from a metadata document. */
  evictable: number;
  /** When the oldest unapproved app still inside the grace period was registered. */
  oldestInGrace: Date | null;
}

/** Why a registration is refused before Better Auth stores it. */
export type PoolRefusal =
  | { status: 429; error: "rate_limited"; description: string; retryAfterSeconds: number }
  | { status: 503; error: "temporarily_unavailable"; description: string; retryAfterSeconds: number };

const hourSeconds = 3600;

/** Seconds until this network's oldest unapproved app leaves the window, at least a minute. */
function networkWait(oldest: Date | null, nowMs: number): number {
  if (!oldest) return hourSeconds;
  const freeAtMs = oldest.getTime() + oauthLimits.unapprovedClientHours * hourSeconds * 1000;
  return Math.max(60, Math.ceil((freeAtMs - nowMs) / 1000));
}

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

/**
 * Refuses a registration when this network already holds its share of
 * unapproved apps, evicted ones included (429, until its oldest stored one
 * leaves the window), or when the pool is full and every unapproved app is
 * still inside the grace period (503, until the oldest of them leaves it).
 * A full pool with an app past the grace period lets the registration
 * through; the route then evicts the oldest such app. Approved apps never
 * count, so a hosted app whose people finish connecting is limited only by
 * the hourly limit.
 */
export function registrationPoolRefusal(counts: UnapprovedClientCounts, nowMs: number): PoolRefusal | null {
  if (counts.fromNetwork + counts.evictedFromNetwork >= oauthLimits.maxUnapprovedClientsPerNetwork) {
    const retryAfterSeconds = networkWait(counts.oldestFromNetwork, nowMs);
    const description = `Your network has registered a lot of apps that nobody has approved yet. Try again in ${describeWait(retryAfterSeconds)}.`;
    return { status: 429, error: "rate_limited", description, retryAfterSeconds };
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
