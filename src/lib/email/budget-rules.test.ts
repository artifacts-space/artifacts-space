import { describe, expect, it } from "vitest";

import { budgetScope, nonSignInDailyLimit, SENDIR_DAILY_RECIPIENTS, utcDayStart } from "./budget-rules";

describe("nonSignInDailyLimit", () => {
  it("should leave 40% of Sendir's daily cap for sign-in links when the share is 60%", () => {
    expect(nonSignInDailyLimit(SENDIR_DAILY_RECIPIENTS)).toBe(120);
  });

  it("should round down and never go below zero when the cap is small", () => {
    expect(nonSignInDailyLimit(5, 0.6)).toBe(3);
    expect(nonSignInDailyLimit(0, 0.6)).toBe(0);
  });
});

describe("utcDayStart", () => {
  it("should return midnight UTC of the same day when given any time that day", () => {
    expect(utcDayStart(Date.UTC(2026, 10, 6, 23, 59, 59)).toISOString()).toBe("2026-11-06T00:00:00.000Z");
    expect(utcDayStart(Date.UTC(2026, 10, 7, 0, 0, 0)).toISOString()).toBe("2026-11-07T00:00:00.000Z");
  });
});

describe("budgetScope", () => {
  it("should share one budget across production and preview when deployed on Vercel", () => {
    expect(budgetScope({ VERCEL_ENV: "production" })).toBe("sendir");
    expect(budgetScope({ VERCEL_ENV: "preview" })).toBe("sendir");
  });

  it("should keep local development on its own count when not deployed", () => {
    expect(budgetScope({})).toBe("local");
    expect(budgetScope({ VERCEL_ENV: "development" })).toBe("local");
  });
});
