import { rateLimitMessage, type RateLimitRefusal } from "./rate-limit";

/**
 * A plain-text 429 for people and scripts: what happened, when to try again,
 * and Retry-After in seconds. Never cached.
 */
export function tooManyRequests(refusal: RateLimitRefusal, headers: Record<string, string> = {}): Response {
  return new Response(rateLimitMessage(refusal.name, refusal.retryAfterSeconds), {
    status: 429,
    headers: {
      ...headers,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": String(refusal.retryAfterSeconds),
    },
  });
}
