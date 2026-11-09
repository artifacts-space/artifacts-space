import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultActor, type BuiltInRoleKey } from "./capability-rules";

/*
 * The team update guard behind Better Auth's update hook. Every change to
 * team settings needs "change the sharing rule" (owners by default), unknown
 * settings are refused, and a new name is stored trimmed. The team lookup
 * and the membership lookup are mocked at the database boundary.
 */

const mocks = vi.hoisted(() => ({ teamRow: vi.fn(), membership: vi.fn() }));

vi.mock("@/db", () => ({
  getDb: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: mocks.teamRow }) }) }) }),
}));
vi.mock("./queries", () => ({ getTeamMembershipById: mocks.membership }));
vi.mock("./setup", () => ({ isHandleAvailable: vi.fn() }));

const { assertTeamUpdateAllowed } = await import("./guards");

const member = { organizationId: "team-1", userId: "user-1" };

function actingAs(role: BuiltInRoleKey) {
  mocks.membership.mockResolvedValue({ ...defaultActor(role), id: "team-1", personal: false });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.teamRow.mockResolvedValue([{ personal: false }]);
});

describe("assertTeamUpdateAllowed", () => {
  it.each(["member", "admin"] as const)("should refuse a rename by a %s, who cannot change team settings by default", async (role) => {
    actingAs(role);
    await expect(assertTeamUpdateAllowed({ name: "New name" }, member)).rejects.toThrow("You do not have permission to do that in this team.");
  });

  it("should refuse the sharing rule for an admin", async () => {
    actingAs("admin");
    await expect(assertTeamUpdateAllowed({ teamSharingNeedsApproval: false }, member)).rejects.toThrow();
  });

  it("should refuse an agent's token even when its membership says owner", async () => {
    mocks.membership.mockResolvedValue({ ...defaultActor("owner"), kind: "agent", id: "team-1", personal: false });
    await expect(assertTeamUpdateAllowed({ name: "New name" }, member)).rejects.toThrow();
  });

  it("should refuse settings the app does not offer, even for an owner", async () => {
    actingAs("owner");
    await expect(assertTeamUpdateAllowed({ logo: "https://example.com/logo.png" }, member)).rejects.toThrow("That team setting cannot change.");
  });

  it("should refuse a new slug", async () => {
    actingAs("owner");
    await expect(assertTeamUpdateAllowed({ slug: "other" }, member)).rejects.toThrow("A team's URL cannot change.");
  });

  it("should refuse any change to a personal team", async () => {
    actingAs("owner");
    mocks.teamRow.mockResolvedValue([{ personal: true }]);
    await expect(assertTeamUpdateAllowed({ name: "Mine" }, member)).rejects.toThrow("Personal team settings cannot change.");
  });

  it("should return the trimmed name for an owner", async () => {
    actingAs("owner");
    await expect(assertTeamUpdateAllowed({ name: "  Studio  " }, member)).resolves.toEqual({ name: "Studio" });
  });

  it("should let an owner change the sharing rule and store nothing else", async () => {
    actingAs("owner");
    await expect(assertTeamUpdateAllowed({ teamSharingNeedsApproval: false }, member)).resolves.toEqual({});
  });
});
