import { beforeEach, describe, expect, it, vi } from "vitest";

import { builtInRoleKeys, builtInRoleNames, defaultActor, defaultRoleCapabilities, type BuiltInRoleKey, type TeamActor } from "./capability-rules";

/*
 * The team update guard behind Better Auth's update hook. Every change to
 * team settings needs "change team settings" (owners by default), unknown
 * settings are refused, and a new name is stored trimmed. The team lookup
 * and the membership lookup are mocked at the database boundary.
 */

const mocks = vi.hoisted(() => ({ teamRow: vi.fn(), membership: vi.fn(), access: vi.fn() }));

vi.mock("@/db", () => ({
  getDb: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: mocks.teamRow }) }) }) }),
}));
vi.mock("./queries", () => ({ getTeamMembershipById: mocks.membership, getTeamAccessById: mocks.access }));
vi.mock("./setup", () => ({ isHandleAvailable: vi.fn() }));

const { assertCanInviteAs, assertTeamUpdateAllowed } = await import("./guards");

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

describe("assertCanInviteAs", () => {
  const roles = new Map([
    ...builtInRoleKeys.map((key): [string, { id: string; key: string; name: string; builtIn: boolean; capabilities: string[] }] => [key, { id: key, key, name: builtInRoleNames[key], builtIn: true, capabilities: [...defaultRoleCapabilities[key]] }]),
  ]);
  const recruiter: TeamActor = { roleKey: "recruiter", kind: "person", capabilities: ["members.invite", "analytics.view"] };

  function inviter(actor: TeamActor) {
    mocks.access.mockResolvedValue({ membership: { ...actor, id: "team-1", personal: false }, roles });
  }

  it("should refuse a custom role that may invite when it invites someone as Admin", async () => {
    inviter(recruiter);
    await expect(assertCanInviteAs("user-1", "team-1", "admin")).rejects.toThrow(/do no more than yours/);
  });

  it("should let a custom role that may invite invite someone as Member", async () => {
    inviter(recruiter);
    await expect(assertCanInviteAs("user-1", "team-1", "member")).resolves.toBeUndefined();
  });

  it("should refuse someone who may not invite, and a role the team does not have", async () => {
    inviter(defaultActor("member"));
    await expect(assertCanInviteAs("user-1", "team-1", "member")).rejects.toThrow();
    inviter(defaultActor("owner"));
    await expect(assertCanInviteAs("user-1", "team-1", "superuser")).rejects.toThrow("That role does not exist in this team.");
  });

  it("should refuse when the inviter is not in the team", async () => {
    mocks.access.mockResolvedValue(null);
    await expect(assertCanInviteAs("user-1", "team-1", "member")).rejects.toThrow();
  });
});
