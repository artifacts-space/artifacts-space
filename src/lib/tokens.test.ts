import { describe, expect, it } from "vitest";

import { LAST_USED_WRITE_INTERVAL_MS, lastUsedIsStale } from "./tokens";

const now = new Date("2026-11-06T12:00:00Z");

describe("lastUsedIsStale", () => {
  it("should write when the token was never used", () => {
    expect(lastUsedIsStale(null, now)).toBe(true);
  });

  it("should skip the write when the token was used within five minutes", () => {
    expect(lastUsedIsStale(new Date(now.getTime() - LAST_USED_WRITE_INTERVAL_MS + 1000), now)).toBe(false);
  });

  it("should write again when the last write is five minutes old or more", () => {
    expect(lastUsedIsStale(new Date(now.getTime() - LAST_USED_WRITE_INTERVAL_MS), now)).toBe(true);
  });
});
