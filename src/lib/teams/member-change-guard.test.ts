import { beforeEach, describe, expect, it, vi } from "vitest";

import { builtInRoleKeys, builtInRoleNames, defaultActor, defaultRoleCapabilities, type TeamActor } from "./capability-rules";
import type { TeamRoleView } from "./capabilities";

/*
 * The second check on Better Auth's role-change and removal calls: the full
 * rule, not only the capability. Each case would be an escalation if it
 * passed. The membership and member lookups are mocked at the database
 * boundary; the rules are real.
 */

const mocks = vi.hoisted(() => ({ access: vi.fn(), members: vi.fn() }));

vi.mock("./queries", () => ({ getTeamAccessById: mocks.access, listTeamMemberActors: mocks.members }));

const { assertMemberChangeAllowed } = await import("./member-change-guard");

const roles = new Map<string, TeamRoleView>([
  ...builtInRoleKeys.map((key): [string, TeamRoleView] => [key, { id: key, key, name: builtInRoleNames[key], builtIn: true, capabilities: [...defaultRoleCapabilities[key]] }]),
  ["people", { id: "people", key: "people", name: "People", builtIn: false, capabilities: ["members.roles", "members.remove", "analytics.view"] }],
]);
const people: TeamActor = { roleKey: "people", kind: "person", capabilities: ["members.roles", "members.remove", "analytics.view"] };

function teamWith(actor: TeamActor) {
  mocks.access.mockResolvedValue({ membership: { ...actor, id: "team-1", personal: false, userId: "actor" }, roles });
  mocks.members.mockResolvedValue([
    { userId: "actor", name: "Actor", memberId: "m-actor", isAgent: false, storedRole: actor.roleKey === "owner" || actor.roleKey === "admin" ? actor.roleKey : "member", actor },
    { userId: "owner", name: "Owner", memberId: "m-owner", isAgent: false, storedRole: "owner", actor: defaultActor("owner") },
    { userId: "admin", name: "Admin", memberId: "m-admin", isAgent: false, storedRole: "admin", actor: defaultActor("admin") },
    { userId: "member", name: "Member", memberId: "m-member", isAgent: false, storedRole: "member", actor: defaultActor("member") },
    { userId: "designer", name: "Designer", memberId: "m-designer", isAgent: false, storedRole: "member", actor: { roleKey: "designer", kind: "person", capabilities: ["share.team"] } },
    { userId: "agent", name: "Agent", memberId: "m-agent", isAgent: true, storedRole: "member", actor: defaultActor("agent") },
  ]);
}

const change = (memberId: string, nextRole: string | null) => assertMemberChangeAllowed({ actorId: "actor", teamId: "team-1", memberId, nextRole });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assertMemberChangeAllowed", () => {
  it("should refuse a custom role that may change roles when it would make someone an admin", async () => {
    teamWith(people);
    await expect(change("m-member", "admin")).rejects.toThrow();
  });

  it("should refuse a custom role that may remove people when the target is an admin", async () => {
    teamWith(people);
    await expect(change("m-admin", null)).rejects.toThrow();
  });

  it("should refuse an admin making an owner or removing one", async () => {
    teamWith(defaultActor("admin"));
    await expect(change("m-member", "owner")).rejects.toThrow();
    await expect(change("m-owner", null)).rejects.toThrow();
  });

  it("should refuse changing an agent, changing oneself, and a member or role that does not exist", async () => {
    teamWith(defaultActor("owner"));
    await expect(change("m-agent", "member")).rejects.toThrow();
    await expect(change("m-actor", "member")).rejects.toThrow();
    await expect(change("m-ghost", "member")).rejects.toThrow("Member not found.");
    await expect(change("m-member", "people")).rejects.toThrow("That role does not exist in this team.");
  });

  it("should refuse a plain member, an agent's token, and someone outside the team", async () => {
    teamWith(defaultActor("member"));
    await expect(change("m-member", null)).rejects.toThrow();
    teamWith({ ...defaultActor("owner"), kind: "agent" });
    await expect(change("m-member", "admin")).rejects.toThrow();
    mocks.access.mockResolvedValue(null);
    await expect(change("m-member", "admin")).rejects.toThrow();
  });

  it("should allow what the server actions allow", async () => {
    teamWith(defaultActor("admin"));
    await expect(change("m-member", "admin")).resolves.toBeUndefined();
    await expect(change("m-member", null)).resolves.toBeUndefined();
    teamWith(people);
    await expect(change("m-member", "member")).resolves.toBeUndefined();
  });

  it("should let a narrow custom role move someone between custom roles, which keeps Better Auth's Member role", async () => {
    // Lead may change roles and share with the team, but does not hold "see views", which the built-in Member role has.
    teamWith({ roleKey: "lead", kind: "person", capabilities: ["members.roles", "share.team"] });
    await expect(change("m-designer", "member")).resolves.toBeUndefined();
  });

  it("should still check a custom-role move against the person's current role", async () => {
    teamWith({ roleKey: "lead", kind: "person", capabilities: ["members.roles"] });
    await expect(change("m-designer", "member")).rejects.toThrow(/can do more than you/);
  });
});
