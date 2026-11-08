import { describe, expect, it } from "vitest";

import { rateLimits, type RateLimitName } from "./limits";
import { decideRateLimit, windowStart } from "./rate-limit-window";

/*
 * What an attacker gets from the sign-in link and report limits, worked out
 * with the real sliding-window decision: one request per second for two
 * hours from one subject (one network, or one email address), counting what
 * gets through in the second hour, once the windows are full.
 */

function allowedInSecondHour(name: RateLimitName): number {
  const { limit, windowSeconds } = rateLimits[name];
  const windowMs = windowSeconds * 1000;
  const counts = new Map<number, number>();
  let allowed = 0;
  for (let second = 0; second < 7200; second += 1) {
    const nowMs = second * 1000;
    const current = windowStart(nowMs, windowMs);
    const decision = decideRateLimit({ previous: counts.get(current - windowMs) ?? 0, current: counts.get(current) ?? 0, nowMs, windowMs, limit });
    if (!decision.allowed) continue;
    counts.set(current, (counts.get(current) ?? 0) + 1);
    if (second >= 3600) allowed += 1;
  }
  return allowed;
}

/** Retry-After right after a burst fills a fresh window, the longest wait a refused visitor sees. */
function longestWait(name: RateLimitName): number {
  const { limit, windowSeconds } = rateLimits[name];
  const windowMs = windowSeconds * 1000;
  return decideRateLimit({ previous: 0, current: limit, nowMs: 0, windowMs, limit }).retryAfterSeconds;
}

describe("sign-in link limits", () => {
  it("should send one email address at most 5 links an hour when someone floods it from any network", () => {
    expect(allowedInSecondHour("magicLinkByEmail")).toBeLessThanOrEqual(5);
  });

  it("should send at most about 100 links an hour from one network when it floods", () => {
    expect(allowedInSecondHour("magicLinkByNetwork")).toBeLessThanOrEqual(104);
  });

  it("should let at least 25 people behind one shared address ask for a link at once when they sign in together", () => {
    expect(rateLimits.magicLinkByNetwork.limit).toBeGreaterThanOrEqual(25);
  });

  it("should make a refused network wait under 17 minutes, not an hour, when it was refused", () => {
    expect(longestWait("magicLinkByNetwork")).toBeLessThanOrEqual(17 * 60);
  });
});

describe("report limits", () => {
  it("should let one network report one artifact at most 3 times an hour when it floods", () => {
    expect(allowedInSecondHour("reportByNetworkArtifact")).toBeLessThanOrEqual(3);
  });

  it("should take at most about 40 reports an hour from one network when it floods", () => {
    expect(allowedInSecondHour("reportByNetwork")).toBeLessThanOrEqual(42);
  });

  it("should make a refused network wait under 17 minutes, not an hour, when it was refused", () => {
    expect(longestWait("reportByNetwork")).toBeLessThanOrEqual(17 * 60);
  });
});
