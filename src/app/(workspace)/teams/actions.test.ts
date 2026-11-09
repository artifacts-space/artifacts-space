import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TeamRoleView } from "@/lib/teams/capabilities";
import { builtInRoleNames, defaultActor, defaultRoleCapabilities, type BuiltInRoleKey, type TeamActor, type TeamCapability } from "@/lib/teams/capability-rules";
import type { TeamMemberActor, TeamMembership } from "@/lib/teams/queries";

/*
 * Team member actions on the server: inviting, canceling, removing, changing
 * roles, and the sharing rule. Every refusal must stop before Better Auth or
 * the role store is reached, so a wrongly granted action fails these tests.
 * The session, the membership lookups, Better Auth, and the store are mocked
 * at their boundaries; the decisions are the real capability rules.
 */

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  membership: vi.fn(),
  members: vi.fn(),
  invitationTeamId: vi.fn(),
  createInvitation: vi.fn(),
  cancelInvitation: vi.fn(),
  removeMember: vi.fn(),
  updateMemberRole: vi.fn(),
  updateOrganization: vi.fn(),
  leaveOrganization: vi.fn(),
  changeMemberRole: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), unstable_rethrow: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/auth/server", () => ({
  getAuth: () => ({
    api: {
      createInvitation: mocks.createInvitation,
      cancelInvitation: mocks.cancelInvitation,
      removeMember: mocks.removeMember,
      updateMemberRole: mocks.updateMemberRole,
      updateOrganization: mocks.updateOrganization,
      leaveOrganization: mocks.leaveOrganization,
    },
  }),
}));
// The viewer's membership comes with the team's roles, as getTeamAccessById loads them.
vi.mock("@/lib/teams/queries", () => ({
  getTeamAccessById: async (userId: string, teamId: string) => {
    const membership: unknown = await mocks.membership(userId, teamId);
    return membership ? { membership, roles: teamRoles } : null;
  },
  listTeamMemberActors: mocks.members,
  getInvitationTeamId: mocks.invitationTeamId,
}));
vi.mock("@/lib/teams/role-store", () => ({ changeMemberRole: mocks.changeMemberRole }));

const actions = await import("./actions");

const designerCapabilities: TeamCapability[] = ["themes.manage", "members.roles", "members.remove", "members.invite", "analytics.view"];

function builtIn(key: BuiltInRoleKey): TeamRoleView {
  return { id: `role-${key}`, key, name: builtInRoleNames[key], builtIn: true, capabilities: [...defaultRoleCapabilities[key]] };
}

const teamRoles = new Map<string, TeamRoleView>([
  ...(["owner", "admin", "member", "agent"] as const).map((key): [string, TeamRoleView] => [key, builtIn(key)]),
  ["designer", { id: "role-designer", key: "designer", name: "Designer", builtIn: false, capabilities: designerCapabilities }],
]);

/** The viewer's membership with a built-in role, or a custom one by key. */
function viewer(roleKey: string, overrides: Partial<TeamMembership> = {}): TeamMembership {
  const role = teamRoles.get(roleKey);
  const betterAuthRole = roleKey === "owner" || roleKey === "admin" ? roleKey : "member";
  return { id: "team-1", slug: "acme", name: "Acme", personal: false, teamSharingNeedsApproval: true, createdBy: "viewer-1", role: betterAuthRole, memberId: "m-viewer", userId: "viewer-1", roleKey, roleName: role?.name ?? roleKey, kind: "person", capabilities: role?.capabilities ?? [], ...overrides };
}

function member(memberId: string, actor: TeamActor, extra: Partial<TeamMemberActor> = {}): TeamMemberActor {
  const storedRole = actor.roleKey === "owner" || actor.roleKey === "admin" ? actor.roleKey : "member";
  return { userId: `user-${memberId}`, name: `Person ${memberId}`, memberId, isAgent: actor.kind === "agent", storedRole, actor, ...extra };
}

/** The team: the viewer, a second owner, an admin, a member, a designer, and an agent. */
function teamWith(viewerRole: TeamActor) {
  return [
    member("m-viewer", viewerRole, { userId: "viewer-1" }),
    member("m-owner", defaultActor("owner")),
    member("m-admin", defaultActor("admin")),
    member("m-member", defaultActor("member")),
    member("m-designer", { roleKey: "designer", kind: "person", capabilities: designerCapabilities }),
    member("m-agent", defaultActor("agent")),
  ];
}

function signInAs(membership: TeamMembership) {
  mocks.membership.mockResolvedValue(membership);
  mocks.members.mockResolvedValue(teamWith(membership));
}

const writes = [mocks.createInvitation, mocks.cancelInvitation, mocks.removeMember, mocks.updateMemberRole, mocks.updateOrganization, mocks.leaveOrganization, mocks.changeMemberRole];

function expectNothingWritten() {
  for (const write of writes) expect(write).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "viewer-1" } });
  for (const write of writes) write.mockResolvedValue(undefined);
  mocks.invitationTeamId.mockResolvedValue("team-1");
});

describe("refusals for every member action", () => {
  const calls = {
    invite: () => actions.inviteMemberAction("team-1", { email: "new@example.com", role: "member" }),
    cancel: () => actions.cancelInvitationAction("team-1", "invite-1"),
    remove: () => actions.removeMemberAction("team-1", "m-member"),
    role: () => actions.updateMemberRoleAction("team-1", "m-member", "designer"),
    sharingRule: () => actions.updateSharingRuleAction("team-1", false),
  };

  it.each(Object.entries(calls))("should refuse %s when the viewer is a plain member", async (_name, call) => {
    signInAs(viewer("member"));
    await expect(call()).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it.each(Object.entries(calls))("should refuse %s when an agent's token holds an owner's membership", async (_name, call) => {
    signInAs(viewer("owner", { kind: "agent" }));
    await expect(call()).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it.each(Object.entries(calls))("should refuse %s in a personal team", async (_name, call) => {
    signInAs(viewer("owner", { personal: true }));
    await expect(call()).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it.each(Object.entries(calls))("should refuse %s when the viewer is not in the team", async (_name, call) => {
    mocks.membership.mockResolvedValue(null);
    await expect(call()).resolves.toEqual({ success: false, error: "Team not found." });
    expectNothingWritten();
  });
});

describe("inviteMemberAction", () => {
  it("should refuse a custom role that may invite when the invitation would be for an Admin", async () => {
    signInAs(viewer("designer"));
    await expect(actions.inviteMemberAction("team-1", { email: "new@example.com", role: "admin" })).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should let a custom role that may invite invite a Member", async () => {
    signInAs(viewer("designer"));
    await expect(actions.inviteMemberAction("team-1", { email: "New@Example.com", role: "member" })).resolves.toEqual({ success: true, data: null });
    expect(mocks.createInvitation).toHaveBeenCalledWith(expect.objectContaining({ body: { email: "new@example.com", role: "member", organizationId: "team-1", resend: true } }));
  });

  it("should refuse an invitation as Owner, whatever the viewer's role", async () => {
    signInAs(viewer("owner"));
    // @ts-expect-error -- "owner" is not an assignable role; the server must reject it at run time too.
    await expect(actions.inviteMemberAction("team-1", { email: "new@example.com", role: "owner" })).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });
});

describe("removeMemberAction", () => {
  it("should refuse an admin removing an owner", async () => {
    signInAs(viewer("admin"));
    await expect(actions.removeMemberAction("team-1", "m-owner")).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse a custom role that may remove people when the target is an Admin", async () => {
    signInAs(viewer("designer"));
    await expect(actions.removeMemberAction("team-1", "m-admin")).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse removing an agent from the member list", async () => {
    signInAs(viewer("owner"));
    await expect(actions.removeMemberAction("team-1", "m-agent")).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse removing someone who is not in the team", async () => {
    signInAs(viewer("owner"));
    await expect(actions.removeMemberAction("team-1", "m-stranger")).resolves.toEqual({ success: false, error: "Member not found." });
    expectNothingWritten();
  });

  it("should let an admin remove a member", async () => {
    signInAs(viewer("admin"));
    await expect(actions.removeMemberAction("team-1", "m-member")).resolves.toEqual({ success: true, data: null });
    expect(mocks.removeMember).toHaveBeenCalledWith(expect.objectContaining({ body: { memberIdOrEmail: "m-member", organizationId: "team-1" } }));
  });
});

describe("updateMemberRoleAction", () => {
  it("should refuse an admin making someone an owner", async () => {
    signInAs(viewer("admin"));
    await expect(actions.updateMemberRoleAction("team-1", "m-member", "owner")).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse a custom role that may change roles when the new role does more than it", async () => {
    signInAs(viewer("designer"));
    await expect(actions.updateMemberRoleAction("team-1", "m-member", "admin")).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse a custom role demoting someone who does more than it", async () => {
    signInAs(viewer("designer"));
    await expect(actions.updateMemberRoleAction("team-1", "m-admin", "member")).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse changing an agent's role", async () => {
    signInAs(viewer("owner"));
    await expect(actions.updateMemberRoleAction("team-1", "m-agent", "admin")).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse giving a person the Agent role", async () => {
    signInAs(viewer("owner"));
    await expect(actions.updateMemberRoleAction("team-1", "m-member", "agent")).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse the viewer changing their own role", async () => {
    signInAs(viewer("admin"));
    await expect(actions.updateMemberRoleAction("team-1", "m-viewer", "member")).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should refuse a role that does not exist in the team", async () => {
    signInAs(viewer("owner"));
    await expect(actions.updateMemberRoleAction("team-1", "m-member", "superuser")).resolves.toEqual({ success: false, error: "That role does not exist in this team." });
    expectNothingWritten();
  });

  it("should store a custom role as Member plus the assignment and its audit row, in one store call", async () => {
    signInAs(viewer("owner"));
    await expect(actions.updateMemberRoleAction("team-1", "m-member", "designer")).resolves.toEqual({ success: true, data: null });
    expect(mocks.updateMemberRole).not.toHaveBeenCalled();
    expect(mocks.changeMemberRole).toHaveBeenCalledTimes(1);
    expect(mocks.changeMemberRole).toHaveBeenCalledWith({
      teamId: "team-1",
      memberId: "m-member",
      storedRole: "member",
      roleId: "role-designer",
      audit: { actorId: "viewer-1", action: "member_role_changed", subject: "Person m-member", before: { role: "Member" }, after: { role: "Designer" } },
    });
  });

  it("should store and log nothing when the person already has that role", async () => {
    signInAs(viewer("owner"));
    await expect(actions.updateMemberRoleAction("team-1", "m-designer", "designer")).resolves.toEqual({ success: true, data: null });
    expectNothingWritten();
  });

  it("should store a built-in role and clear any custom assignment in the same store call", async () => {
    signInAs(viewer("owner"));
    await expect(actions.updateMemberRoleAction("team-1", "m-designer", "admin")).resolves.toEqual({ success: true, data: null });
    expect(mocks.changeMemberRole).toHaveBeenCalledWith(expect.objectContaining({ memberId: "m-designer", storedRole: "admin", roleId: null }));
  });

  it("should report a failure and make no other write when the role change cannot be stored", async () => {
    signInAs(viewer("owner"));
    mocks.changeMemberRole.mockRejectedValue(new Error("connection lost"));
    await expect(actions.updateMemberRoleAction("team-1", "m-admin", "designer")).resolves.toEqual({ success: false, error: "The role could not be changed. Please try again." });
    expect(mocks.changeMemberRole).toHaveBeenCalledTimes(1);
    for (const write of writes.filter((item) => item !== mocks.changeMemberRole)) expect(write).not.toHaveBeenCalled();
  });
});

describe("leaveTeamAction", () => {
  it("should refuse the last owner leaving", async () => {
    mocks.membership.mockResolvedValue(viewer("owner"));
    mocks.members.mockResolvedValue([member("m-viewer", defaultActor("owner"), { userId: "viewer-1" }), member("m-admin", defaultActor("admin"))]);
    await expect(actions.leaveTeamAction("team-1")).resolves.toMatchObject({ success: false, error: expect.stringMatching(/at least one owner/) as unknown });
    expectNothingWritten();
  });

  it("should let an owner leave when another owner stays", async () => {
    signInAs(viewer("owner"));
    await expect(actions.leaveTeamAction("team-1")).resolves.toEqual({ success: true, data: null });
    expect(mocks.leaveOrganization).toHaveBeenCalledWith(expect.objectContaining({ body: { organizationId: "team-1" } }));
  });

  it("should let a member leave", async () => {
    signInAs(viewer("member"));
    await expect(actions.leaveTeamAction("team-1")).resolves.toEqual({ success: true, data: null });
  });
});

describe("updateSharingRuleAction", () => {
  it("should refuse an admin, who does not hold the sharing rule by default", async () => {
    signInAs(viewer("admin"));
    await expect(actions.updateSharingRuleAction("team-1", false)).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it("should let an owner change the sharing rule", async () => {
    signInAs(viewer("owner"));
    await expect(actions.updateSharingRuleAction("team-1", false)).resolves.toEqual({ success: true, data: null });
    expect(mocks.updateOrganization).toHaveBeenCalledWith(expect.objectContaining({ body: { organizationId: "team-1", data: { teamSharingNeedsApproval: false } } }));
  });
});

describe("cancelInvitationAction", () => {
  it("should refuse an invitation from another team even when the viewer may invite here", async () => {
    signInAs(viewer("owner"));
    mocks.invitationTeamId.mockResolvedValue("team-2");
    await expect(actions.cancelInvitationAction("team-1", "invite-1")).resolves.toEqual({ success: false, error: "That invitation is not in this team." });
    expectNothingWritten();
  });

  it("should cancel an invitation of the viewer's team", async () => {
    signInAs(viewer("admin"));
    await expect(actions.cancelInvitationAction("team-1", "invite-1")).resolves.toEqual({ success: true, data: null });
    expect(mocks.cancelInvitation).toHaveBeenCalledTimes(1);
    expect(mocks.cancelInvitation.mock.calls[0]?.[0]).toMatchObject({ body: { invitationId: "invite-1" } });
  });
});
