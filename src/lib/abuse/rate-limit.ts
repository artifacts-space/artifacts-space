import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { rateLimitBucket } from "@/db/schema";
import { UserFacingError } from "@/lib/user-facing-error";

import { rateLimitMessages, rateLimits, type RateLimitName } from "./limits";
import { decideRateLimit, describeWait, windowStart, type RateLimitDecision } from "./rate-limit-window";

/**
 * Buckets older than this are deleted now and then. The longest window is a
 * day, and a sliding window also reads the day before, so keep three days.
 */
const CLEANUP_AGE_MS = 3 * 24 * 3_600_000;
const CLEANUP_CHANCE = 0.02;

/** A rate limit was reached. The message says what happened and when to try again. */
export class RateLimitError extends UserFacingError {
  readonly retryAfterSeconds: number;

  constructor(name: RateLimitName, retryAfterSeconds: number) {
    super(rateLimitMessage(name, retryAfterSeconds));
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

/** One limit to count in hitRateLimits. */
export interface RateLimitCheck {
  name: RateLimitName;
  subject: string;
}

/** The first refused limit of a hitRateLimits call, or null when every limit allowed the hit. */
export interface RateLimitRefusal {
  name: RateLimitName;
  retryAfterSeconds: number;
}

const countedRowSchema = z.object({ key: z.string(), current: z.coerce.number(), previous: z.coerce.number() });

function bucketWindows(check: RateLimitCheck, nowMs: number) {
  const windowMs = rateLimits[check.name].windowSeconds * 1000;
  const current = windowStart(nowMs, windowMs);
  return { ...check, key: `${check.name}:${check.subject}`, windowMs, current: new Date(current), previous: new Date(current - windowMs) };
}

/**
 * Counts one hit against several limits in a single database round trip, for
 * busy read paths. Unlike hitRateLimit, refused hits are counted too, so a
 * flood stays refused until it stops; waiting for Retry-After is enough to
 * recover. Every check must have a different name.
 */
export async function hitRateLimits(checks: readonly RateLimitCheck[], nowMs = Date.now()): Promise<RateLimitRefusal | null> {
  if (checks.length === 0) return null;
  const buckets = checks.map((check) => bucketWindows(check, nowMs));
  const inserts = sql.join(buckets.map((bucket) => sql`(${bucket.key}, ${bucket.current.toISOString()}::timestamptz, 1)`), sql`, `);
  const previous = sql.join(buckets.map((bucket) => sql`(${bucket.key}, ${bucket.previous.toISOString()}::timestamptz)`), sql`, `);
  const result = await getDb().execute(sql`
    with bumped as (
      insert into ${rateLimitBucket} (key, window_start, count) values ${inserts}
      on conflict (key, window_start) do update set count = ${rateLimitBucket.count} + 1
      returning key, count
    )
    select bumped.key as key, bumped.count as current, coalesce(earlier.count, 0) as previous
    from bumped
    join (values ${previous}) as windows (key, previous_start) on windows.key = bumped.key
    left join ${rateLimitBucket} as earlier on earlier.key = bumped.key and earlier.window_start = windows.previous_start
  `);
  const counted = new Map(z.array(countedRowSchema).parse(result.rows).map((row) => [row.key, row]));
  await cleanUpOldBuckets(nowMs).catch(() => undefined);
  for (const bucket of buckets) {
    const row = counted.get(bucket.key);
    if (!row) continue;
    const { limit } = rateLimits[bucket.name];
    const decision = decideRateLimit({ previous: row.previous, current: Math.max(0, row.current - 1), nowMs, windowMs: bucket.windowMs, limit });
    if (!decision.allowed) return { name: bucket.name, retryAfterSeconds: decision.retryAfterSeconds };
  }
  return null;
}

/** The plain-English refusal for a limit, with when to try again. */
export function rateLimitMessage(name: RateLimitName, retryAfterSeconds: number): string {
  return `${rateLimitMessages[name]} Try again in ${describeWait(retryAfterSeconds)}.`;
}

/** Like hitRateLimit, but throws a RateLimitError (safe to show) when the limit is reached. */
export async function enforceRateLimit(name: RateLimitName, subject: string): Promise<void> {
  const decision = await hitRateLimit(name, subject);
  if (!decision.allowed) throw new RateLimitError(name, decision.retryAfterSeconds);
}

/** Throws a RateLimitError for the first limit that refuses, checking them in order and stopping there. */
export async function enforceRateLimits(checks: readonly RateLimitCheck[]): Promise<void> {
  for (const check of checks) await enforceRateLimit(check.name, check.subject);
}
