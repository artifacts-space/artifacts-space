import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";

import { team } from "@/db/schema";
import { fakeDatabaseUrl } from "@/test/fake-database-url";

import { effectiveRoleKey, groupRoleRows, resolveActor, teamRolesQuery } from "./capabilities";
import { defaultRoleCapabilities } from "./capability-rules";
import { listTeamMemberActorsQuery, listTeamMembersQuery, membershipQuery } from "./queries";

/*
 * Role lookups decide what people may do, so these tests read the SQL itself
 * (AGENTS.md tripwire): every join compares two different tables' columns,
 * and nothing compares a column with itself.
 */

const db = drizzle({ client: neon(fakeDatabaseUrl()) });
const selfCompare = /"(\w+)" = "\1"(?!\.)/;

describe("teamRolesQuery", () => {
  it("should join capabilities on the role id and filter by the team ids when it loads roles", () => {
    const { sql, params } = teamRolesQuery(db, ["team-1", "team-2"]).toSQL();
    expect(sql).toContain('left join "team_role_capability" on "team_role_capability"."role_id" = "team_role"."id"');
    expect(sql).toMatch(/where "team_role"\."team_id" in \(\$1, \$2\)/);
    expect(params).toEqual(["team-1", "team-2"]);
    expect(sql).not.toMatch(selfCompare);
  });
});

describe("membershipQuery", () => {
  it("should tie the custom role to the member's own team when it resolves roles", () => {
    const { sql } = membershipQuery(db, "user-1").toSQL();
    expect(sql).toContain('left join "team_role_assignment" on "team_role_assignment"."member_id" = "team_member"."id"');
    expect(sql).toContain('"assigned_role"."id" = "team_role_assignment"."role_id"');
    expect(sql).toContain('"assigned_role"."team_id" = "team_member"."team_id"');
    expect(sql).toContain('left join "agent" on "agent"."user_id" = "team_member"."user_id"');
    expect(sql).not.toMatch(/"team_id" = "team_id"/);
  });

  it("should filter by the user when it lists memberships", () => {
    const { sql, params } = membershipQuery(db, "user-1").toSQL();
    expect(sql).toMatch(/where "team_member"\."user_id" = \$\d+/);
    expect(params).toContain("user-1");
  });

  it("should keep the user filter when a caller narrows to one team", () => {
    const { sql, params } = membershipQuery(db, "user-1", eq(team.id, "team-1")).toSQL();
    expect(sql).toMatch(/where \("team_member"\."user_id" = \$\d+ and "team"\."id" = \$\d+\)/);
    expect(params).toEqual(expect.arrayContaining(["user-1", "team-1"]));
  });
});

describe("listTeamMembersQuery", () => {
  it("should leave agents out with a join, never a subquery that compares a column with itself", () => {
    const { sql, params } = listTeamMembersQuery(db, "team-1").toSQL();
    expect(sql).toContain('left join "agent" on "agent"."user_id" = "team_member"."user_id"');
    expect(sql).toMatch(/where \("team_member"\."team_id" = \$\d+ and "agent"\."user_id" is null\)/);
    expect(sql).toContain('"assigned_role"."team_id" = "team_member"."team_id"');
    expect(sql).not.toMatch(/exists/i);
    expect(sql).not.toMatch(/"user_id" = "user_id"/);
    expect(params).toContain("team-1");
  });
});

describe("listTeamMemberActorsQuery", () => {
  it("should tie every member to the team and their custom role to the same team", () => {
    const { sql, params } = listTeamMemberActorsQuery(db, "team-1").toSQL();
    expect(sql).toMatch(/where "team_member"\."team_id" = \$\d+/);
    expect(sql).toContain('"assigned_role"."team_id" = "team_member"."team_id"');
    expect(params).toContain("team-1");
    expect(sql).not.toMatch(/"team_id" = "team_id"/);
  });
});

const row = (key: string, capability: string | null, builtIn = true) => ({ id: `role-${key}`, teamId: "team-1", key, name: key, builtIn, capability });

describe("groupRoleRows", () => {
  it("should keep today's rules for built-in roles a team has no rows for", () => {
    const roles = groupRoleRows([], ["team-1"]).get("team-1");
    expect(roles?.get("admin")?.capabilities).toEqual(defaultRoleCapabilities.admin);
    expect(roles?.get("member")?.capabilities).toEqual(defaultRoleCapabilities.member);
  });

  it("should use the stored capabilities when a role has rows", () => {
    const roles = groupRoleRows([row("member", "approve.sharing"), row("member", "analytics.view")], ["team-1"]).get("team-1");
    expect(roles?.get("member")?.capabilities).toEqual(["approve.sharing", "analytics.view"]);
  });

  it("should give a stored role with no capabilities nothing", () => {
    const roles = groupRoleRows([row("member", null)], ["team-1"]).get("team-1");
    expect(roles?.get("member")?.capabilities).toEqual([]);
  });

  it("should drop capability names the code does not know", () => {
    const roles = groupRoleRows([row("designer", "members.everything", false), row("designer", "themes.manage", false)], ["team-1"]).get("team-1");
    expect(roles?.get("designer")?.capabilities).toEqual(["themes.manage"]);
  });
});

describe("resolveActor", () => {
  const roles = groupRoleRows([row("designer", "themes.manage", false)], ["team-1"]).get("team-1");

  it("should give agents the Agent role whatever Better Auth stores", () => {
    expect(effectiveRoleKey({ role: "owner", isAgent: true, customKey: "designer" })).toBe("agent");
    expect(resolveActor({ role: "member", isAgent: true, customKey: null }, roles).kind).toBe("agent");
  });

  it.each(["owner", "admin", "agent", "member"])("should never let a custom assignment keyed %s stand in for a built-in role", (key) => {
    const owners = groupRoleRows([row(key, "members.roles", false)], ["team-1"]).get("team-1");
    const actor = resolveActor({ role: "member", isAgent: false, customKey: key }, owners);
    expect(actor.roleKey).toBe("member");
  });

  it("should prefer a custom role over the stored built-in role", () => {
    expect(resolveActor({ role: "member", isAgent: false, customKey: "designer" }, roles)).toMatchObject({ roleKey: "designer", capabilities: ["themes.manage"], roleName: "designer" });
  });

  it("should grant nothing when the custom role no longer exists", () => {
    expect(resolveActor({ role: "admin", isAgent: false, customKey: "gone" }, roles).capabilities).toEqual([]);
  });

  it("should grant nothing when the team's roles could not be loaded", () => {
    expect(resolveActor({ role: "admin", isAgent: false, customKey: null }, undefined).capabilities).toEqual([]);
  });
});
