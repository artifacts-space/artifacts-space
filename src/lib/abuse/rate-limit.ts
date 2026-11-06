import { and, eq, inArray, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { rateLimitBucket } from "@/db/schema";
import { UserFacingError } from "@/lib/user-facing-error";

import { rateLimitMessages, rateLimits, type RateLimitName } from "./limits";
import { decideRateLimit, describeWait, windowStart, type RateLimitDecision } from "./rate-limit-window";

/** Buckets older than this are deleted now and then. Every window is at most an hour. */
const CLEANUP_AGE_MS = 24 * 3_600_000;
const CLEANUP_CHANCE = 0.02;

/** A rate limit was reached. The message says what happened and when to try again. */
export class RateLimitError extends UserFacingError {
  readonly retryAfterSeconds: number;

  constructor(name: RateLimitName, retryAfterSeconds: number) {
    super(`${rateLimitMessages[name]} Try again in ${describeWait(retryAfterSeconds)}.`);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function cleanUpOldBuckets(nowMs: number) {
  if (Math.random() >= CLEANUP_CHANCE) return;
  await getDb().delete(rateLimitBucket).where(lt(rateLimitBucket.windowStart, new Date(nowMs - CLEANUP_AGE_MS)));
}

/**
 * Counts one hit for `subject` (a user id or hashed network key) against a
 * named limit, and returns whether it was allowed. Refused hits are not
 * counted, so waiting is enough to recover.
 */
export async function hitRateLimit(name: RateLimitName, subject: string, nowMs = Date.now()): Promise<RateLimitDecision> {
  const { limit, windowSeconds } = rateLimits[name];
  const windowMs = windowSeconds * 1000;
  const key = `${name}:${subject}`;
  const current = new Date(windowStart(nowMs, windowMs));
  const previous = new Date(current.getTime() - windowMs);

  const rows = await getDb()
    .select({ windowStart: rateLimitBucket.windowStart, count: rateLimitBucket.count })
    .from(rateLimitBucket)
    .where(and(eq(rateLimitBucket.key, key), inArray(rateLimitBucket.windowStart, [previous, current])));
  const countAt = (start: Date) => rows.find((row) => row.windowStart.getTime() === start.getTime())?.count ?? 0;
  const decision = decideRateLimit({ previous: countAt(previous), current: countAt(current), nowMs, windowMs, limit });
  if (!decision.allowed) return decision;

  await getDb()
    .insert(rateLimitBucket)
    .values({ key, windowStart: current, count: 1 })
    .onConflictDoUpdate({ target: [rateLimitBucket.key, rateLimitBucket.windowStart], set: { count: sql`${rateLimitBucket.count} + 1` } });
  await cleanUpOldBuckets(nowMs).catch((error: unknown) => {
    console.error("[rate-limit] Cleanup failed", error instanceof Error ? error.name : "unknown error");
  });
  return decision;
}

/** Like hitRateLimit, but throws a RateLimitError (safe to show) when the limit is reached. */
export async function enforceRateLimit(name: RateLimitName, subject: string): Promise<void> {
  const decision = await hitRateLimit(name, subject);
  if (!decision.allowed) throw new RateLimitError(name, decision.retryAfterSeconds);
}
