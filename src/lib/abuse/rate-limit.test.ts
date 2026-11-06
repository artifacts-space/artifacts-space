import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ execute: vi.fn(), delete: vi.fn() }));

vi.mock("@/db", () => ({ getDb: () => ({ execute: db.execute, delete: () => ({ where: db.delete }) }) }));

const { hitRateLimits, rateLimitMessage, RateLimitError } = await import("./rate-limit");

const hour = 3_600_000;
const midHour = hour * 10 + hour / 2;

describe("hitRateLimits", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
  });

  it("should allow the hit when every counter stays within its limit", async () => {
    db.execute.mockResolvedValue({ rows: [{ key: "readByUser:u1", current: 10, previous: 0 }, { key: "readByToken:t1", current: 10, previous: 0 }] });
    const refusal = await hitRateLimits([{ name: "readByUser", subject: "u1" }, { name: "readByToken", subject: "t1" }], midHour);
    expect(refusal).toBeNull();
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it("should refuse with the first full limit and a wait when a counter is over", async () => {
    db.execute.mockResolvedValue({ rows: [{ key: "readByUser:u1", current: 20, previous: 0 }, { key: "readByToken:t1", current: 1801, previous: 0 }] });
    const refusal = await hitRateLimits([{ name: "readByUser", subject: "u1" }, { name: "readByToken", subject: "t1" }], midHour);
    expect(refusal?.name).toBe("readByToken");
    expect(refusal?.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("should not touch the database when there is nothing to check", async () => {
    await expect(hitRateLimits([])).resolves.toBeNull();
    expect(db.execute).not.toHaveBeenCalled();
  });
});

describe("rateLimitMessage", () => {
  it("should say what happened and when to try again in plain words", () => {
    expect(rateLimitMessage("artifactUpdate", 600)).toBe("You have changed artifacts a lot in the last hour. Try again in about 10 minutes.");
    expect(new RateLimitError("readByToken", 30).message).toBe("This connection has read a lot in the last hour. Try again in a minute.");
  });
});
