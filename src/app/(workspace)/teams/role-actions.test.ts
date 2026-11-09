import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TeamRoleView } from "@/lib/teams/capabilities";
import { builtInRoleNames, defaultRoleCapabilities, type BuiltInRoleKey, type TeamCapability } from "@/lib/teams/capability-rules";
import { teamLimits } from "@/lib/teams/limits";
import type { TeamMembership } from "@/lib/teams/queries";
import type * as RoleStore from "@/lib/teams/role-store";

/*
 * Role editing on the server. Nobody grants a capability they do not hold,
 * edits a role at or above their own, changes a locked cell, or deletes a
 * built-in role; agents never edit roles. Each refusal must stop before the
 * role store is reached, and every change writes an audit row. The session,
 * the lookups, and the store are mocked at their boundaries.
 */

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  membership: vi.fn(),
  setRoleCapability: vi.fn(),
  createCustomRole: vi.fn(),
  deleteCustomRole: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), unstable_rethrow: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
// The viewer's membership comes with the team's roles, as getTeamAccessById loads them.
vi.mock("@/lib/teams/queries", () => ({
  getTeamAccessById: async (userId: string, teamId: string) => {
    const membership: unknown = await mocks.membership(userId, teamId);
    return membership ? { membership, roles: teamRoles } : null;
  },
}));
vi.mock("@/lib/teams/role-store", async (importOriginal) => ({
  ...(await importOriginal<typeof RoleStore>()),
  setRoleCapability: mocks.setRoleCapability,
  createCustomRole: mocks.createCustomRole,
  deleteCustomRole: mocks.deleteCustomRole,
}));

const actions = await import("./role-actions");

const designerCapabilities: TeamCapability[] = ["themes.manage", "members.roles", "analytics.view"];

function builtIn(key: BuiltInRoleKey): TeamRoleView {
  return { id: `role-${key}`, key, name: builtInRoleNames[key], builtIn: true, capabilities: [...defaultRoleCapabilities[key]] };
}

const teamRoles = new Map<string, TeamRoleView>([
  ...(["owner", "admin", "member", "agent"] as const).map((key): [string, TeamRoleView] => [key, builtIn(key)]),
  ["designer", { id: "role-designer", key: "designer", name: "Designer", builtIn: false, capabilities: designerCapabilities }],
  ["reviewer", { id: "role-reviewer", key: "reviewer", name: "Reviewer", builtIn: false, capabilities: ["approve.sharing"] }],
]);

function viewer(roleKey: string, overrides: Partial<TeamMembership> = {}): TeamMembership {
  const role = teamRoles.get(roleKey);
  const betterAuthRole = roleKey === "owner" || roleKey === "admin" ? roleKey : "member";
  return { id: "team-1", slug: "acme", name: "Acme", personal: false, teamSharingNeedsApproval: true, createdBy: "viewer-1", role: betterAuthRole, memberId: "m-viewer", userId: "viewer-1", roleKey, roleName: role?.name ?? roleKey, kind: "person", capabilities: role?.capabilities ?? [], iconUrl: null, ...overrides };
}

const writes = [mocks.setRoleCapability, mocks.createCustomRole, mocks.deleteCustomRole];

function expectNothingWritten() {
  for (const write of writes) expect(write).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "viewer-1" } });
  for (const write of writes) write.mockResolvedValue("role-new");
});

describe("refusals for every role action", () => {
  const calls = {
    update: () => actions.updateRoleCapabilityAction("team-1", "member", "share.team", true),
    create: () => actions.createRoleAction("team-1", { name: "Writer", capabilities: ["share.team"] }),
    delete: () => actions.deleteRoleAction("team-1", "designer"),
  };

  it.each(Object.entries(calls))("should refuse %s when the viewer is a plain member", async (_name, call) => {
    mocks.membership.mockResolvedValue(viewer("member"));
    await expect(call()).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it.each(Object.entries(calls))("should refuse %s when an agent's token holds an owner's membership", async (_name, call) => {
    mocks.membership.mockResolvedValue(viewer("owner", { kind: "agent" }));
    await expect(call()).resolves.toEqual({ success: false, error: "Only people can change roles." });
    expectNothingWritten();
  });

  it.each(Object.entries(calls))("should refuse %s in a personal team", async (_name, call) => {
    mocks.membership.mockResolvedValue(viewer("owner", { personal: true }));
    await expect(call()).resolves.toEqual({ success: false, error: "A personal team has no roles to change." });
    expectNothingWritten();
  });

  it.each(Object.entries(calls))("should refuse %s when the viewer is not in the team", async (_name, call) => {
    mocks.membership.mockResolvedValue(null);
    await expect(call()).resolves.toEqual({ success: false, error: "Team not found." });
    expectNothingWritten();
  });
});

describe("updateRoleCapabilityAction", () => {
  it("should refuse editing the Owner role, even for an owner", async () => {
    mocks.membership.mockResolvedValue(viewer("owner"));
    await expect(actions.updateRoleCapabilityAction("team-1", "owner", "share.team", false)).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse an admin editing the Admin role", async () => {
    mocks.membership.mockResolvedValue(viewer("admin"));
    await expect(actions.updateRoleCapabilityAction("team-1", "admin", "settings.team", true)).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse an admin granting a capability the admin does not hold", async () => {
    mocks.membership.mockResolvedValue(viewer("admin"));
    await expect(actions.updateRoleCapabilityAction("team-1", "member", "settings.team", true)).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse a custom role editing a custom role at its own rank", async () => {
    mocks.membership.mockResolvedValue(viewer("designer"));
    await expect(actions.updateRoleCapabilityAction("team-1", "reviewer", "themes.manage", true)).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse giving the Agent role a locked capability", async () => {
    mocks.membership.mockResolvedValue(viewer("owner"));
    await expect(actions.updateRoleCapabilityAction("team-1", "agent", "approve.sharing", true)).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse a role that does not exist in the team", async () => {
    mocks.membership.mockResolvedValue(viewer("owner"));
    await expect(actions.updateRoleCapabilityAction("team-1", "ghost", "share.team", true)).resolves.toEqual({ success: false, error: "That role does not exist in this team." });
    expectNothingWritten();
  });

  it("should refuse a capability that does not exist", async () => {
    mocks.membership.mockResolvedValue(viewer("owner"));
    await expect(actions.updateRoleCapabilityAction("team-1", "member", "root.everything", true)).resolves.toEqual({ success: false, error: "That capability does not exist." });
    expectNothingWritten();
  });

  it("should change only the one cell and audit it", async () => {
    mocks.membership.mockResolvedValue(viewer("admin"));
    await expect(actions.updateRoleCapabilityAction("team-1", "member", "share.team", true)).resolves.toEqual({ success: true, data: null });
    expect(mocks.setRoleCapability).toHaveBeenCalledWith({
      teamId: "team-1",
      key: "member",
      name: "Member",
      builtIn: true,
      capability: "share.team",
      on: true,
      next: ["share.team", "analytics.view"],
      audit: { actorId: "viewer-1", action: "role_updated", subject: "Member", before: ["analytics.view"], after: ["share.team", "analytics.view"] },
    });
  });

  it("should let an admin take a capability away from a custom role", async () => {
    mocks.membership.mockResolvedValue(viewer("admin"));
    await expect(actions.updateRoleCapabilityAction("team-1", "designer", "themes.manage", false)).resolves.toEqual({ success: true, data: null });
    expect(mocks.setRoleCapability).toHaveBeenCalledWith(expect.objectContaining({ key: "designer", capability: "themes.manage", on: false }));
  });
});

describe("createRoleAction", () => {
  it("should refuse a new role with a capability the viewer does not hold", async () => {
    mocks.membership.mockResolvedValue(viewer("admin"));
    await expect(actions.createRoleAction("team-1", { name: "Rule Keeper", capabilities: ["settings.team"] })).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse a built-in role's name", async () => {
    mocks.membership.mockResolvedValue(viewer("owner"));
    await expect(actions.createRoleAction("team-1", { name: "Admin", capabilities: [] })).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse a name the team already uses", async () => {
    mocks.membership.mockResolvedValue(viewer("owner"));
    await expect(actions.createRoleAction("team-1", { name: "Designer", capabilities: [] })).resolves.toEqual({ success: false, error: "A role with that name already exists." });
    expectNothingWritten();
  });

  it("should say a name is too close when it shortens to an existing role's key", async () => {
    mocks.membership.mockResolvedValue(viewer("owner"));
    await expect(actions.createRoleAction("team-1", { name: "Designer!", capabilities: [] })).resolves.toEqual({ success: false, error: "That name is too close to the Designer role. Try a different one." });
    expectNothingWritten();
  });

  it("should refuse a custom role creating another custom role, which would sit at its own rank", async () => {
    mocks.membership.mockResolvedValue(viewer("designer"));
    await expect(actions.createRoleAction("team-1", { name: "Brand Lead", capabilities: ["themes.manage"] })).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse a new role when the team already has the most custom roles it can hold", async () => {
    mocks.membership.mockResolvedValue(viewer("owner"));
    const fillerKeys = Array.from({ length: teamLimits.maxCustomRoles - 2 }, (_, index) => `filler-${String(index)}`);
    for (const key of fillerKeys) teamRoles.set(key, { id: `role-${key}`, key, name: key, builtIn: false, capabilities: [] });
    try {
      await expect(actions.createRoleAction("team-1", { name: "Brand Lead", capabilities: [] })).resolves.toEqual({ success: false, error: `A team can have ${String(teamLimits.maxCustomRoles)} custom roles. Delete one to make another.` });
      expectNothingWritten();
    } finally {
      for (const key of fillerKeys) teamRoles.delete(key);
    }
  });

  it("should create and audit a role the viewer may make", async () => {
    mocks.membership.mockResolvedValue(viewer("admin"));
    await expect(actions.createRoleAction("team-1", { name: "  Brand Lead ", capabilities: ["themes.manage"] })).resolves.toEqual({ success: true, data: { key: "brand-lead" } });
    expect(mocks.createCustomRole).toHaveBeenCalledWith({ teamId: "team-1", key: "brand-lead", name: "Brand Lead", capabilities: ["themes.manage"], audit: { actorId: "viewer-1", action: "role_created", subject: "Brand Lead", before: null, after: ["themes.manage"] } });
  });
});

describe("deleteRoleAction", () => {
  it.each(["owner", "admin", "member", "agent"])("should refuse deleting the built-in %s role", async (key) => {
    mocks.membership.mockResolvedValue(viewer("owner"));
    await expect(actions.deleteRoleAction("team-1", key)).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse a custom role deleting a custom role at its own rank", async () => {
    mocks.membership.mockResolvedValue(viewer("designer"));
    await expect(actions.deleteRoleAction("team-1", "reviewer")).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should delete and audit a custom role below an admin", async () => {
    mocks.membership.mockResolvedValue(viewer("admin"));
    await expect(actions.deleteRoleAction("team-1", "designer")).resolves.toEqual({ success: true, data: null });
    expect(mocks.deleteCustomRole).toHaveBeenCalledWith({ teamId: "team-1", key: "designer", audit: { actorId: "viewer-1", action: "role_deleted", subject: "Designer", before: designerCapabilities, after: null } });
  });
});
