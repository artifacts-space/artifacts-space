/**
 * Sliding-window rate limiting from two fixed windows. The previous window's
 * count is weighted by how much of it still overlaps the sliding window, so
 * a burst at a window edge cannot double the limit. Pure functions; the
 * database counters live in rate-limit.ts.
 */

/** Start of the fixed window that contains `nowMs`, in milliseconds. */
export function windowStart(nowMs: number, windowMs: number): number {
  return Math.floor(nowMs / windowMs) * windowMs;
}

/** The estimated number of hits in the last `windowMs`, including the current window. */
export function slidingCount(input: { previous: number; current: number; nowMs: number; windowMs: number }): number {
  const elapsed = input.nowMs - windowStart(input.nowMs, input.windowMs);
  const previousWeight = 1 - elapsed / input.windowMs;
  return input.previous * previousWeight + input.current;
}

/** The outcome of one check. `retryAfterSeconds` is 0 when allowed. */
export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Whether one more hit fits under `limit`. When it does not, estimates how
 * long until it would, assuming no further hits.
 */
export function decideRateLimit(input: { previous: number; current: number; nowMs: number; windowMs: number; limit: number }): RateLimitDecision {
  const count = slidingCount(input);
  if (count + 1 <= input.limit) return { allowed: true, retryAfterSeconds: 0 };
  const start = windowStart(input.nowMs, input.windowMs);
  const freeAt = input.current + 1 > input.limit
    ? // This window alone is full: wait into the next window until its weight drops enough.
      start + input.windowMs + (1 - (input.limit - 1) / input.current) * input.windowMs
    : // The previous window's weight must drop enough within this window.
      start + (1 - (input.limit - 1 - input.current) / input.previous) * input.windowMs;
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((freeAt - input.nowMs) / 1000)) };
}

/** "a minute", "about 12 minutes", "about 1 hour", or "about 9 hours", for error messages. */
export function describeWait(seconds: number): string {
  if (seconds <= 60) return "a minute";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `about ${String(minutes)} minutes`;
  const hours = Math.round(minutes / 60);
  return hours <= 1 ? "about 1 hour" : `about ${String(hours)} hours`;
}
