import { APIError } from "better-auth/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ hasRoom: vi.fn(), hit: vi.fn() }));

vi.mock("@/lib/email/budget", () => ({ emailBudgetHasRoom: mocks.hasRoom }));
vi.mock("@/lib/abuse/rate-limit", () => ({
  hitRateLimit: mocks.hit,
  rateLimitMessage: (name: string, seconds: number) => `${name} ${String(seconds)}`,
}));

const { assertCanCreateTeam, assertCanInvite, invitationLimitChecks } = await import("./invitation-limits");

describe("assertCanInvite", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("should allow the invitation when the budget has room and no limit is reached", async () => {
    mocks.hasRoom.mockResolvedValue(true);
    mocks.hit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    await expect(assertCanInvite("u1", "t1")).resolves.toBeUndefined();
    expect(mocks.hit).toHaveBeenCalledTimes(3);
  });

  it("should refuse with the limit's message when the inviter sent many invitations", async () => {
    mocks.hasRoom.mockResolvedValue(true);
    mocks.hit.mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 }).mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 900 });
    const error: unknown = await assertCanInvite("u1", "t1").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(APIError);
    expect((error as APIError).message).toBe("teamInviteByUserDay 900");
  });

  it("should refuse before counting when today's email budget is used up", async () => {
    mocks.hasRoom.mockResolvedValue(false);
    await expect(assertCanInvite("u1", "t1")).rejects.toThrow(/Sign-in links still work/);
    expect(mocks.hit).not.toHaveBeenCalled();
  });
});

describe("invitationLimitChecks", () => {
  it("should limit the inviter per hour and per day and the team per day", () => {
    expect(invitationLimitChecks("u1", "t1")).toEqual([
      { name: "teamInviteByUserHour", subject: "u1" },
      { name: "teamInviteByUserDay", subject: "u1" },
      { name: "teamInviteByTeamDay", subject: "t1" },
    ]);
  });
});

describe("assertCanCreateTeam", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should allow a new team when the person is under the hourly limit", async () => {
    mocks.hit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    await expect(assertCanCreateTeam("u1")).resolves.toBeUndefined();
    expect(mocks.hit).toHaveBeenCalledWith("teamCreate", "u1");
  });

  it("should refuse with a message when the person created many teams", async () => {
    mocks.hit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    await expect(assertCanCreateTeam("u1")).rejects.toThrow("teamCreate 60");
  });
});
