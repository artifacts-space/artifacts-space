import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ returning: vi.fn() }));

vi.mock("@/db", () => ({
  getDb: () => ({
    insert: () => ({ values: () => ({ onConflictDoUpdate: () => ({ returning: db.returning }) }) }),
  }),
}));

const { reserveBudgetedEmail } = await import("./budget");

describe("reserveBudgetedEmail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("should allow the email when the counter went up", async () => {
    db.returning.mockResolvedValue([{ count: 7 }]);
    await expect(reserveBudgetedEmail("mention")).resolves.toBe(true);
  });

  it("should refuse and log clearly when today's budget is used up", async () => {
    db.returning.mockResolvedValue([]);
    await expect(reserveBudgetedEmail("team-invitation")).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Sign-in links are not affected"));
  });
});
