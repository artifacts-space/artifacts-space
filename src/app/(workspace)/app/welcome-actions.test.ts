import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Closing the welcome card: signed-in people only, for a team they are in,
 * and always for the session's person, never an id the page sent. The store
 * is mocked.
 */

const mocks = vi.hoisted(() => ({ session: vi.fn(), dismissTeamWelcome: vi.fn() }));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/teams/welcome", () => ({ dismissTeamWelcome: mocks.dismissTeamWelcome }));

const { dismissTeamWelcomeAction } = await import("./welcome-actions");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "user-1" } });
  mocks.dismissTeamWelcome.mockResolvedValue(true);
});

describe("dismissTeamWelcomeAction", () => {
  it("should save the dismissal for the signed-in member when they are in the team", async () => {
    await expect(dismissTeamWelcomeAction("team-1")).resolves.toEqual({ success: true, data: null });
    expect(mocks.dismissTeamWelcome).toHaveBeenCalledWith("user-1", "team-1");
  });

  it("should refuse and save nothing when nobody is signed in", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await dismissTeamWelcomeAction("team-1")).success).toBe(false);
    expect(mocks.dismissTeamWelcome).not.toHaveBeenCalled();
  });

  it("should refuse when the person is not in the team", async () => {
    mocks.dismissTeamWelcome.mockResolvedValue(false);
    await expect(dismissTeamWelcomeAction("team-2")).resolves.toEqual({ success: false, error: "You are not in this team." });
  });

  it("should refuse a team id that is not a string without saving", async () => {
    await expect(dismissTeamWelcomeAction({ id: "team-1" })).resolves.toEqual({ success: false, error: "Unknown team." });
    expect(mocks.dismissTeamWelcome).not.toHaveBeenCalled();
  });

  it("should return a plain message when the database fails", async () => {
    mocks.dismissTeamWelcome.mockRejectedValue(new Error("connection lost"));
    await expect(dismissTeamWelcomeAction("team-1")).resolves.toEqual({ success: false, error: "Could not close the welcome. Try again." });
  });
});
