import { describe, expect, it } from "vitest";

import { SENDIR_DAILY_RECIPIENTS } from "@/lib/email/budget-rules";

import { rateLimits, type RateLimitName } from "./limits";
import { decideRateLimit, windowStart } from "./rate-limit-window";

/*
 * What an attacker gets from the sign-in link and report limits, worked out
 * with the real sliding-window decision: one request per second from one
 * subject (one network, or one email address), passing only when every
 * listed limit allows it, and counting what gets through once the windows
 * are full. Refused requests are not counted here; the sign-in path counts
 * them too (hitRateLimits), which only lets fewer through, so these are
 * upper bounds.
 */

const hourSeconds = 3600;
const daySeconds = 86_400;

function allowedOnceFull(names: readonly RateLimitName[], periodSeconds: number): number {
  const counts = new Map<string, number>();
  const key = (name: RateLimitName, start: number) => `${name}:${String(start)}`;
  let allowed = 0;
  for (let second = 0; second < periodSeconds * 2; second += 1) {
    const nowMs = second * 1000;
    const fits = names.every((name) => {
      const { limit, windowSeconds } = rateLimits[name];
      const windowMs = windowSeconds * 1000;
      const current = windowStart(nowMs, windowMs);
      const previous = counts.get(key(name, current - windowMs)) ?? 0;
      return decideRateLimit({ previous, current: counts.get(key(name, current)) ?? 0, nowMs, windowMs, limit }).allowed;
    });
    if (!fits) continue;
    for (const name of names) {
      const start = windowStart(nowMs, rateLimits[name].windowSeconds * 1000);
      counts.set(key(name, start), (counts.get(key(name, start)) ?? 0) + 1);
    }
    if (second >= periodSeconds) allowed += 1;
  }
  return allowed;
}

/** Retry-After right after a burst fills a fresh window, the longest wait a refused visitor sees. */
function longestWait(name: RateLimitName): number {
  const { limit, windowSeconds } = rateLimits[name];
  return decideRateLimit({ previous: 0, current: limit, nowMs: 0, windowMs: windowSeconds * 1000, limit }).retryAfterSeconds;
}

describe("sign-in link limits", () => {
  it("should send one email address at most 5 links an hour when someone floods it from any network", () => {
    expect(allowedOnceFull(["magicLinkByEmail"], hourSeconds)).toBeLessThanOrEqual(5);
  });

  it("should let one network spend at most a tenth of the daily email cap when it floods", () => {
    const perDay = allowedOnceFull(["magicLinkByNetwork", "magicLinkByNetworkDay"], daySeconds);
    expect(perDay).toBeLessThanOrEqual(SENDIR_DAILY_RECIPIENTS / 10);
  });

  it("should let 10 people behind one shared address ask for a link at once when they sign in together", () => {
    expect(rateLimits.magicLinkByNetwork.limit).toBeGreaterThanOrEqual(10);
  });

  it("should make a refused network wait under 20 minutes when it hit the short window", () => {
    expect(longestWait("magicLinkByNetwork")).toBeLessThanOrEqual(20 * 60);
  });
});

describe("report limits", () => {
  it("should let one network report one artifact at most 3 times an hour when it floods", () => {
    expect(allowedOnceFull(["reportByNetworkArtifact"], hourSeconds)).toBeLessThanOrEqual(3);
  });

  it("should take at most 10 reports a day from one network when it floods", () => {
    expect(allowedOnceFull(["reportByNetwork", "reportByNetworkDay"], daySeconds)).toBeLessThanOrEqual(10);
  });

  it("should make a refused network wait under 20 minutes when it hit the short window", () => {
    expect(longestWait("reportByNetwork")).toBeLessThanOrEqual(20 * 60);
  });
});
