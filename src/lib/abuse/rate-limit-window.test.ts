import { describe, expect, it } from "vitest";

import { decideRateLimit, describeWait, slidingCount, windowStart } from "./rate-limit-window";

const hour = 3_600_000;

describe("windowStart", () => {
  it("should round down to the start of the fixed window when a time falls inside it", () => {
    expect(windowStart(hour * 5 + 1234, hour)).toBe(hour * 5);
    expect(windowStart(hour * 5, hour)).toBe(hour * 5);
  });
});

describe("slidingCount", () => {
  it("should count the whole previous window when the current window just started", () => {
    expect(slidingCount({ previous: 10, current: 2, nowMs: hour * 3, windowMs: hour })).toBe(12);
  });

  it("should weight the previous window by its remaining overlap when halfway through", () => {
    expect(slidingCount({ previous: 10, current: 2, nowMs: hour * 3 + hour / 2, windowMs: hour })).toBe(7);
  });
});

describe("decideRateLimit", () => {
  const base = { windowMs: hour, limit: 5 };

  it("should allow a hit when the count stays within the limit", () => {
    expect(decideRateLimit({ ...base, previous: 0, current: 4, nowMs: hour * 2 })).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("should refuse a hit when the current window is already full", () => {
    const decision = decideRateLimit({ ...base, previous: 0, current: 5, nowMs: hour * 2 + hour / 2 });
    expect(decision.allowed).toBe(false);
    // Half an hour left in this window, then a fifth of the next one: 30 + 12 minutes.
    expect(decision.retryAfterSeconds).toBe(42 * 60);
  });

  it("should refuse a burst at the window edge when the previous window was full", () => {
    const decision = decideRateLimit({ ...base, previous: 5, current: 0, nowMs: hour * 2 + 1000 });
    expect(decision.allowed).toBe(false);
    // The previous window's weight must fall to 4/5, a fifth of the way into this window.
    expect(decision.retryAfterSeconds).toBe(12 * 60 - 1);
  });

  it("should allow again when the previous window has mostly slid out", () => {
    expect(decideRateLimit({ ...base, previous: 5, current: 0, nowMs: hour * 2 + hour / 2 }).allowed).toBe(true);
  });
});

describe("describeWait", () => {
  it("should describe short, medium, and long waits in words", () => {
    expect(describeWait(30)).toBe("a minute");
    expect(describeWait(600)).toBe("about 10 minutes");
    expect(describeWait(3600)).toBe("about 1 hour");
  });
});
