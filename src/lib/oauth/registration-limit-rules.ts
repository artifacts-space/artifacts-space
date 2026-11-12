import { z } from "zod";

import { describeWait } from "@/lib/abuse/rate-limit-window";

import { oauthLimits } from "./config";

/**
 * Pure rules for the registration endpoint's pool limits
 * (src/lib/oauth/registration-limits.ts). A registration writes one app row
 * and one resource link; apps nobody approves are deleted after
 * oauthLimits.unapprovedClientHours by the cleanup job, so what one address
 * can fill is the pool of unapproved apps, and that is what these cap.
 */

/** Unapproved apps within the cleanup window: all of them, this network's, and when its oldest was registered. */
export interface UnapprovedClientCounts {
  total: number;
  fromNetwork: number;
  oldestFromNetwork: Date | null;
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

/**
 * Refuses a registration when this network already holds its share of
 * unapproved apps (429, until its oldest one leaves the window), or when the
 * whole pool is full (503, as before). Approved apps never count, so a hosted
 * app whose people finish connecting is limited only by the hourly limit.
 */
export function registrationPoolRefusal(counts: UnapprovedClientCounts, nowMs: number): PoolRefusal | null {
  if (counts.fromNetwork >= oauthLimits.maxUnapprovedClientsPerNetwork) {
    const retryAfterSeconds = networkWait(counts.oldestFromNetwork, nowMs);
    const description = `Your network has registered a lot of apps that nobody has approved yet. Try again in ${describeWait(retryAfterSeconds)}.`;
    return { status: 429, error: "rate_limited", description, retryAfterSeconds };
  }
  if (counts.total >= oauthLimits.maxUnapprovedClients) {
    return { status: 503, error: "temporarily_unavailable", description: "Too many apps are waiting for approval. Try again later.", retryAfterSeconds: hourSeconds };
  }
  return null;
}

const registeredSchema = z.object({ client_id: z.string().min(1).max(2048) });

/** The client id in a successful registration answer (RFC 7591 §3.2.1), or null. */
export function registeredClientId(body: unknown): string | null {
  const parsed = registeredSchema.safeParse(body);
  return parsed.success ? parsed.data.client_id : null;
}
