import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TeamRoleView } from "@/lib/teams/capabilities";
import { builtInRoleNames, defaultRoleCapabilities, type BuiltInRoleKey, type TeamCapability } from "@/lib/teams/capability-rules";
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
  roles: vi.fn(),
  saveRoleCapabilities: vi.fn(),
  createCustomRole: vi.fn(),
  deleteCustomRole: vi.fn(),
  writePermissionAudit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/teams/queries", () => ({ getTeamMembershipById: mocks.membership }));
vi.mock("@/lib/teams/capabilities", () => ({ loadTeamRoles: mocks.roles }));
vi.mock("@/lib/teams/role-store", async (importOriginal) => ({
  ...(await importOriginal<typeof RoleStore>()),
  saveRoleCapabilities: mocks.saveRoleCapabilities,
  createCustomRole: mocks.createCustomRole,
  deleteCustomRole: mocks.deleteCustomRole,
  writePermissionAudit: mocks.writePermissionAudit,
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
  return { id: "team-1", slug: "acme", name: "Acme", personal: false, teamSharingNeedsApproval: true, createdBy: "viewer-1", role: betterAuthRole, memberId: "m-viewer", userId: "viewer-1", roleKey, roleName: role?.name ?? roleKey, kind: "person", capabilities: role?.capabilities ?? [], ...overrides };
}

const writes = [mocks.saveRoleCapabilities, mocks.createCustomRole, mocks.deleteCustomRole, mocks.writePermissionAudit];

function expectNothingWritten() {
  for (const write of writes) expect(write).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "viewer-1" } });
  mocks.roles.mockResolvedValue(new Map([["team-1", teamRoles]]));
  for (const write of writes) write.mockResolvedValue("role-new");
});

describe("refusals for every role action", () => {
  const calls = {
    update: () => actions.updateRoleCapabilitiesAction("team-1", "member", ["analytics.view", "share.team"]),
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
    await expect(call()).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it.each(Object.entries(calls))("should refuse %s in a personal team", async (_name, call) => {
    mocks.membership.mockResolvedValue(viewer("owner", { personal: true }));
    await expect(call()).resolves.toEqual({ success: false, error: "Team not found." });
    expectNothingWritten();
  });

  it.each(Object.entries(calls))("should refuse %s when the viewer is not in the team", async (_name, call) => {
    mocks.membership.mockResolvedValue(null);
    await expect(call()).resolves.toEqual({ success: false, error: "Team not found." });
    expectNothingWritten();
  });
});

describe("updateRoleCapabilitiesAction", () => {
  it("should refuse editing the Owner role, even for an owner", async () => {
    mocks.membership.mockResolvedValue(viewer("owner"));
    await expect(actions.updateRoleCapabilitiesAction("team-1", "owner", [])).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse an admin editing the Admin role", async () => {
    mocks.membership.mockResolvedValue(viewer("admin"));
    await expect(actions.updateRoleCapabilitiesAction("team-1", "admin", [...defaultRoleCapabilities.admin, "settings.sharing"])).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse an admin granting a capability the admin does not hold", async () => {
    mocks.membership.mockResolvedValue(viewer("admin"));
    await expect(actions.updateRoleCapabilitiesAction("team-1", "member", ["analytics.view", "settings.sharing"])).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse a custom role editing a custom role at its own rank", async () => {
    mocks.membership.mockResolvedValue(viewer("designer"));
    await expect(actions.updateRoleCapabilitiesAction("team-1", "reviewer", ["approve.sharing", "themes.manage"])).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse giving the Agent role a locked capability", async () => {
    mocks.membership.mockResolvedValue(viewer("owner"));
    await expect(actions.updateRoleCapabilitiesAction("team-1", "agent", ["analytics.view", "approve.sharing"])).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse a role that does not exist in the team", async () => {
    mocks.membership.mockResolvedValue(viewer("owner"));
    await expect(actions.updateRoleCapabilitiesAction("team-1", "ghost", [])).resolves.toEqual({ success: false, error: "That role does not exist in this team." });
    expectNothingWritten();
  });

  it("should save and audit a change the viewer may make, dropping unknown capabilities", async () => {
    mocks.membership.mockResolvedValue(viewer("admin"));
    await expect(actions.updateRoleCapabilitiesAction("team-1", "member", ["analytics.view", "share.team", "root.everything"])).resolves.toEqual({ success: true, data: null });
    expect(mocks.saveRoleCapabilities).toHaveBeenCalledWith({ teamId: "team-1", key: "member", name: "Member", builtIn: true, capabilities: ["analytics.view", "share.team"] });
    expect(mocks.writePermissionAudit).toHaveBeenCalledWith({ teamId: "team-1", actorId: "viewer-1", action: "role_updated", subject: "Member", before: ["analytics.view"], after: ["analytics.view", "share.team"] });
  });
});

describe("createRoleAction", () => {
  it("should refuse a new role with a capability the viewer does not hold", async () => {
    mocks.membership.mockResolvedValue(viewer("admin"));
    await expect(actions.createRoleAction("team-1", { name: "Rule Keeper", capabilities: ["settings.sharing"] })).resolves.toMatchObject({ success: false });
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

  it("should refuse a custom role creating another custom role, which would sit at its own rank", async () => {
    mocks.membership.mockResolvedValue(viewer("designer"));
    await expect(actions.createRoleAction("team-1", { name: "Brand Lead", capabilities: ["themes.manage"] })).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should create and audit a role the viewer may make", async () => {
    mocks.membership.mockResolvedValue(viewer("admin"));
    await expect(actions.createRoleAction("team-1", { name: "  Brand Lead ", capabilities: ["themes.manage"] })).resolves.toEqual({ success: true, data: { key: "brand-lead" } });
    expect(mocks.createCustomRole).toHaveBeenCalledWith({ teamId: "team-1", key: "brand-lead", name: "Brand Lead", capabilities: ["themes.manage"] });
    expect(mocks.writePermissionAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "role_created", subject: "Brand Lead", before: null, after: ["themes.manage"] }));
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
    expect(mocks.deleteCustomRole).toHaveBeenCalledWith("team-1", "designer");
    expect(mocks.writePermissionAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "role_deleted", subject: "Designer", before: designerCapabilities, after: null }));
  });
});
