import { describe, expect, it } from "vitest";

import { SENDIR_DAILY_RECIPIENTS } from "@/lib/email/budget-rules";

import { magicLinkChecks } from "@/lib/auth/magic-link-limits";
import { teamIconRateLimitChecks } from "@/lib/teams/team-icon-rules";

import { rateLimits, type RateLimitName } from "./limits";
import type { RateLimitCheck } from "./rate-limit";
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

/**
 * Replays sign-in requests the way the sign-in route counts them
 * (hitRateLimits): every request is counted against every limit, refused or
 * not, and passes only when every limit allowed it. Returns how many passed.
 */
function replay(requests: readonly { atMs: number; checks: readonly RateLimitCheck[] }[]): number {
  const counts = new Map<string, number>();
  const key = (check: RateLimitCheck, start: number) => `${check.name}:${check.subject}:${String(start)}`;
  let allowed = 0;
  for (const { atMs, checks } of requests) {
    const fits = checks.every((check) => {
      const { limit, windowSeconds } = rateLimits[check.name];
      const windowMs = windowSeconds * 1000;
      const current = windowStart(atMs, windowMs);
      return decideRateLimit({ previous: counts.get(key(check, current - windowMs)) ?? 0, current: counts.get(key(check, current)) ?? 0, nowMs: atMs, windowMs, limit }).allowed;
    });
    for (const check of checks) {
      const start = windowStart(atMs, rateLimits[check.name].windowSeconds * 1000);
      counts.set(key(check, start), (counts.get(key(check, start)) ?? 0) + 1);
    }
    if (fits) allowed += 1;
  }
  return allowed;
}

/** Some time well inside a window, so a test does not depend on where the windows start. */
const start = 1_800_000_000_000 + 7_000;

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
    const perDay = allowedOnceFull(["magicLinkByNetworkMinute", "magicLinkByNetwork", "magicLinkByNetworkDay"], daySeconds);
    expect(perDay).toBeLessThanOrEqual(SENDIR_DAILY_RECIPIENTS / 10);
  });

  it("should send at most 2 links when one network asks for 5 made-up addresses at one domain within 2 seconds", () => {
    const burst = [1, 2, 3, 4, 5].map((n) => ({ atMs: start + n * 400, checks: magicLinkChecks("net", `probe${String(n)}@example.net`) }));
    expect(replay(burst)).toBe(2);
  });

  it("should send at most 2 links a minute when one network asks for a new address every second", () => {
    const flood = Array.from({ length: 60 }, (_, n) => ({ atMs: start + n * 1000, checks: magicLinkChecks("net", `flood${String(n)}@example.net`) }));
    expect(replay(flood)).toBeLessThanOrEqual(2);
  });

  it("should send one address at most 1 link a minute when it is asked for every 5 seconds from different networks", () => {
    const flood = Array.from({ length: 12 }, (_, n) => ({ atMs: start + n * 5000, checks: magicLinkChecks(`net${String(n)}`, "ada@example.com") }));
    expect(replay(flood)).toBe(1);
  });

  it("should let 10 people behind one shared address sign in within 10 minutes when they ask one a minute", () => {
    const people = Array.from({ length: 10 }, (_, n) => ({ atMs: start + n * 60_000, checks: magicLinkChecks("office", `person${String(n)}@example.com`) }));
    expect(replay(people)).toBe(10);
  });

  it("should let 2 people behind one shared address ask for links at the same moment", () => {
    const pair = ["ann@example.com", "bob@example.com"].map((email) => ({ atMs: start, checks: magicLinkChecks("office", email) }));
    expect(replay(pair)).toBe(2);
  });

  it("should make a refused burst wait about a minute when it hit the one-minute window", () => {
    expect(longestWait("magicLinkByNetworkMinute")).toBeLessThanOrEqual(2 * 60);
    expect(longestWait("magicLinkByEmailMinute")).toBeLessThanOrEqual(2 * 60);
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

/**
 * Icon requests spread evenly over 48 minutes inside one hour window, the
 * way the icon route counts them: every request against the member's limit
 * and the network backstop.
 */
function iconRequests(count: number, userFor: (index: number) => string | null, network = "office") {
  const spacingMs = (48 * 60 * 1000) / count;
  return Array.from({ length: count }, (_, index) => ({ atMs: start + index * spacingMs, checks: teamIconRateLimitChecks(userFor(index), network) }));
}

describe("team icon limits", () => {
  it("should never refuse a member who opens 100 pages of 36 icons each in an hour with the browser cache off", () => {
    expect(replay(iconRequests(100 * 36, () => "member-1"))).toBe(3600);
  });

  it("should never refuse a 500-person office behind one address when each member loads 100 icons in an hour", () => {
    expect(replay(iconRequests(500 * 100, (index) => `member-${String(index % 500)}`))).toBe(50_000);
  });

  it("should cap one account at its own limit when it scrapes icons", () => {
    expect(replay(iconRequests(20_000, () => "scraper"))).toBeLessThanOrEqual(rateLimits.teamIconByUser.limit);
  });

  it("should cap many accounts or signed-out requests from one address at the network backstop", () => {
    expect(replay(iconRequests(100_000, (index) => (index % 2 === 0 ? null : `account-${String(index % 1000)}`)))).toBeLessThanOrEqual(rateLimits.teamIconByNetwork.limit);
  });
});
