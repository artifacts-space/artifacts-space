import { describe, expect, it } from "vitest";

import { defaultActor, defaultRoleCapabilities, teamCapabilities, type TeamActor, type TeamCapability } from "./capability-rules";
import { teamLimits } from "./limits";
import {
  assignRoleProblem,
  capabilityChangeProblem,
  changedCapabilities,
  createRoleProblem,
  customRoleKey,
  customRoleNameProblem,
  deleteRoleProblem,
  editRoleProblem,
  inviteProblem,
  leaveProblem,
  mayCreateRoles,
  removeMemberProblem,
  type TargetWithRole,
} from "./role-admin-rules";

const owner = defaultActor("owner");
const admin = defaultActor("admin");
const member = defaultActor("member");
const agent = defaultActor("agent");
/** A custom role that may change roles but holds little else. */
const lead: TeamActor = { roleKey: "lead", kind: "person", capabilities: ["members.roles", "members.invite", "analytics.view"] };

const target = (roleKey: string, capabilities: readonly TeamCapability[] = [], extra: Partial<TargetWithRole> = {}): TargetWithRole => ({ roleKey, capabilities, isAgent: false, isSelf: false, ...extra });
const role = (key: "owner" | "admin" | "member") => ({ key, capabilities: defaultRoleCapabilities[key] });

describe("editRoleProblem", () => {
  it("should let an owner edit Admin and an admin edit Member, Agent, and custom roles", () => {
    expect(editRoleProblem(owner, "admin")).toBeNull();
    expect(editRoleProblem(admin, "member")).toBeNull();
    expect(editRoleProblem(admin, "agent")).toBeNull();
    expect(editRoleProblem(admin, "designer")).toBeNull();
  });

  it("should refuse a role at or above the actor's own", () => {
    expect(editRoleProblem(admin, "admin")).not.toBeNull();
    expect(editRoleProblem(admin, "owner")).not.toBeNull();
    expect(editRoleProblem(lead, "designer")).not.toBeNull();
  });

  it("should refuse the Owner role even for owners", () => {
    expect(editRoleProblem(owner, "owner")).not.toBeNull();
  });

  it("should refuse members, agents, and nobody", () => {
    expect(editRoleProblem(member, "agent")).not.toBeNull();
    expect(editRoleProblem({ ...admin, kind: "agent" }, "member")).not.toBeNull();
    expect(editRoleProblem(null, "member")).not.toBeNull();
  });
});

describe("capabilityChangeProblem, for every capability", () => {
  for (const capability of teamCapabilities) {
    it(`should refuse granting ${capability} when the actor does not hold it`, () => {
      expect(capabilityChangeProblem(lead.capabilities.includes(capability) ? { ...lead, capabilities: [] } : lead, "member", [], [capability])).not.toBeNull();
    });

    it(`should refuse taking away ${capability} when the actor does not hold it`, () => {
      expect(capabilityChangeProblem({ ...lead, capabilities: ["members.roles"] }, "member", [capability], [])).toBe(capability === "members.roles" ? null : "You can only grant or take away capabilities you hold.");
    });

    it(`should refuse ${capability} on the Owner role`, () => {
      expect(capabilityChangeProblem(owner, "owner", [], [capability])).not.toBeNull();
    });
  }

  it("should refuse giving agents what agents never hold, even for an owner", () => {
    for (const capability of ["approve.sharing", "approve.edits", "members.invite", "members.roles", "members.remove", "agents.manage", "share.public"] as const) {
      expect(capabilityChangeProblem(owner, "agent", ["analytics.view"], ["analytics.view", capability]), capability).toBe("That capability is locked for this role.");
    }
  });

  it("should let an admin give members a capability the admin holds", () => {
    expect(capabilityChangeProblem(admin, "member", ["analytics.view"], ["analytics.view", "approve.sharing"])).toBeNull();
  });

  it("should refuse an admin giving members the sharing rule, which admins do not hold", () => {
    expect(capabilityChangeProblem(admin, "member", [], ["settings.team"])).not.toBeNull();
  });

  it("should list only the capabilities that changed", () => {
    expect(changedCapabilities(["share.team", "analytics.view"], ["analytics.view", "approve.edits"])).toEqual(["share.team", "approve.edits"]);
  });
});

describe("mayCreateRoles", () => {
  it("should let owners and admins create roles, but never an agent holding an admin's capabilities", () => {
    expect(mayCreateRoles(defaultActor("owner"))).toBe(true);
    expect(mayCreateRoles(admin)).toBe(true);
    expect(mayCreateRoles({ ...admin, kind: "agent" })).toBe(false);
  });

  it("should refuse a custom-role holder, a member, an agent, and no member at all", () => {
    expect(mayCreateRoles(lead)).toBe(false);
    expect(mayCreateRoles(member)).toBe(false);
    expect(mayCreateRoles(agent)).toBe(false);
    expect(mayCreateRoles(null)).toBe(false);
  });
});

describe("createRoleProblem and deleteRoleProblem", () => {
  it("should let an admin create a custom role with capabilities the admin holds", () => {
    expect(createRoleProblem(admin, ["themes.manage", "analytics.view"], 0)).toBeNull();
  });

  it("should refuse a custom role with a capability the creator lacks", () => {
    expect(createRoleProblem(admin, ["settings.team"], 0)).not.toBeNull();
  });

  it("should refuse a custom-role holder creating a role at their own level", () => {
    expect(createRoleProblem(lead, [], 0)).not.toBeNull();
  });

  it("should refuse a new custom role when the team has the most it can hold", () => {
    expect(createRoleProblem(admin, ["analytics.view"], teamLimits.maxCustomRoles - 1)).toBeNull();
    expect(createRoleProblem(admin, ["analytics.view"], teamLimits.maxCustomRoles)).toMatch(/Delete one/);
  });

  it("should never delete a built-in role", () => {
    for (const key of ["owner", "admin", "member", "agent"]) expect(deleteRoleProblem(owner, key)).not.toBeNull();
    expect(deleteRoleProblem(owner, "designer")).toBeNull();
    expect(deleteRoleProblem(member, "designer")).not.toBeNull();
  });
});

describe("assignRoleProblem", () => {
  it("should let an owner make an owner, and an admin make an admin, as today", () => {
    expect(assignRoleProblem(owner, target("member", defaultRoleCapabilities.member), role("owner"), 1)).toBeNull();
    expect(assignRoleProblem(admin, target("member", defaultRoleCapabilities.member), role("admin"), 1)).toBeNull();
  });

  it("should refuse an admin making an owner or changing one", () => {
    expect(assignRoleProblem(admin, target("member", defaultRoleCapabilities.member), role("owner"), 1)).not.toBeNull();
    expect(assignRoleProblem(admin, target("owner", defaultRoleCapabilities.owner), role("member"), 2)).not.toBeNull();
  });

  it("should refuse giving a role that does more than the actor's", () => {
    expect(assignRoleProblem(lead, target("member", defaultRoleCapabilities.member), role("admin"), 1)).not.toBeNull();
    expect(assignRoleProblem(lead, target("member", defaultRoleCapabilities.member), { key: "approver", capabilities: ["approve.sharing"] }, 1)).not.toBeNull();
  });

  it("should refuse changing someone whose role does more than the actor's", () => {
    expect(assignRoleProblem(lead, target("admin", defaultRoleCapabilities.admin), role("member"), 1)).not.toBeNull();
  });

  it("should refuse changing the actor's own role, an agent, or to the Agent role", () => {
    expect(assignRoleProblem(owner, target("owner", defaultRoleCapabilities.owner, { isSelf: true }), role("member"), 3)).not.toBeNull();
    expect(assignRoleProblem(owner, target("agent", defaultRoleCapabilities.agent, { isAgent: true }), role("admin"), 1)).not.toBeNull();
    expect(assignRoleProblem(owner, target("member", defaultRoleCapabilities.member), { key: "agent", capabilities: [] }, 1)).not.toBeNull();
  });

  it("should keep the last owner an owner", () => {
    expect(assignRoleProblem(owner, target("owner", defaultRoleCapabilities.owner), role("admin"), 1)).toBe("A team always keeps at least one owner.");
    expect(assignRoleProblem(owner, target("owner", defaultRoleCapabilities.owner), role("admin"), 2)).toBeNull();
  });

  it("should refuse members and agents", () => {
    expect(assignRoleProblem(member, target("member", defaultRoleCapabilities.member), role("member"), 1)).not.toBeNull();
    expect(assignRoleProblem({ ...owner, kind: "agent" }, target("member", defaultRoleCapabilities.member), role("admin"), 1)).not.toBeNull();
    expect(assignRoleProblem(agent, target("member", defaultRoleCapabilities.member), role("member"), 1)).not.toBeNull();
  });
});

describe("removeMemberProblem", () => {
  it("should let an admin remove another admin, as today", () => {
    expect(removeMemberProblem(admin, target("admin", defaultRoleCapabilities.admin), 1)).toBeNull();
  });

  it("should refuse removing an owner unless the actor is an owner and another owner stays", () => {
    expect(removeMemberProblem(admin, target("owner", defaultRoleCapabilities.owner), 2)).not.toBeNull();
    expect(removeMemberProblem(owner, target("owner", defaultRoleCapabilities.owner), 1)).not.toBeNull();
    expect(removeMemberProblem(owner, target("owner", defaultRoleCapabilities.owner), 2)).toBeNull();
  });

  it("should refuse members, agents, self, and agent rows", () => {
    expect(removeMemberProblem(member, target("member"), 1)).not.toBeNull();
    expect(removeMemberProblem({ ...admin, kind: "agent" }, target("member"), 1)).not.toBeNull();
    expect(removeMemberProblem(admin, target("member", [], { isSelf: true }), 1)).not.toBeNull();
    expect(removeMemberProblem(admin, target("agent", [], { isAgent: true }), 1)).not.toBeNull();
  });
});

describe("leaveProblem", () => {
  it("should refuse the last owner leaving", () => {
    expect(leaveProblem(defaultActor("owner"), 1)).toMatch(/at least one owner/);
  });

  it("should let an owner leave when another owner stays", () => {
    expect(leaveProblem(defaultActor("owner"), 2)).toBeNull();
  });

  it("should let admins, members, and custom roles leave whatever the owner count", () => {
    for (const actor of [defaultActor("admin"), defaultActor("member"), { roleKey: "designer", kind: "person" as const, capabilities: [] }]) expect(leaveProblem(actor, 1)).toBeNull();
  });
});

describe("inviteProblem", () => {
  it("should let admins invite admins and members, as today", () => {
    expect(inviteProblem(admin, role("admin"))).toBeNull();
    expect(inviteProblem(admin, role("member"))).toBeNull();
  });

  it("should let a custom role that may invite invite only to roles it covers", () => {
    expect(inviteProblem(lead, role("member"))).toBeNull();
    expect(inviteProblem(lead, role("admin"))).not.toBeNull();
  });

  it("should refuse members and agents", () => {
    expect(inviteProblem(member, role("member"))).not.toBeNull();
    expect(inviteProblem({ ...admin, kind: "agent" }, role("member"))).not.toBeNull();
  });
});

describe("custom role names", () => {
  it("should make a key from the name", () => {
    expect(customRoleKey("  Senior Designer! ")).toBe("senior-designer");
  });

  it("should refuse empty, too long, symbol-only, and built-in names", () => {
    expect(customRoleNameProblem(" ")).not.toBeNull();
    expect(customRoleNameProblem("x".repeat(41))).not.toBeNull();
    expect(customRoleNameProblem("!!!")).not.toBeNull();
    expect(customRoleNameProblem("Admin")).not.toBeNull();
    expect(customRoleNameProblem("Designer")).toBeNull();
  });
});
