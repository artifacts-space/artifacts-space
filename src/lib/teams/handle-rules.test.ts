import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";

import { fakeDatabaseUrl } from "@/test/fake-database-url";

import { groupTeamHandles, memberRole, type TeamHandleRow } from "./handle-rules";
import { teamHandlesQuery } from "./team-handles";

const row = (teamId: string, userId: string, handle: string | null, isAgent = false): TeamHandleRow => ({ teamId, userId, handle, name: userId.toUpperCase(), isAgent });

describe("groupTeamHandles", () => {
  it("should list each team's members by handle, with their kind, when the caller is in the team", () => {
    const grouped = groupTeamHandles([row("crew", "zoe", "zoe"), row("crew", "bot", "bot", true), row("crew", "me", "me")], { callerId: "me", teamIds: ["crew"] });
    expect(grouped.get("crew")).toEqual({
      members: [
        { handle: "bot", name: "BOT", kind: "agent" },
        { handle: "zoe", name: "ZOE", kind: "person" },
      ],
      cut: false,
    });
  });

  it("should never list a team the caller did not pass, even when a row for it arrives", () => {
    const grouped = groupTeamHandles([row("crew", "ada", "ada"), row("press", "olga", "olga")], { callerId: "me", teamIds: ["crew"] });
    expect([...grouped.keys()]).toEqual(["crew"]);
    expect(JSON.stringify([...grouped.values()])).not.toContain("olga");
  });

  it("should leave out members without a handle, since nobody can mention them", () => {
    expect(groupTeamHandles([row("crew", "ada", null)], { callerId: "me", teamIds: ["crew"] }).get("crew")).toEqual({ members: [], cut: false });
  });

  it("should stop at the cap and say the list was cut when a team is larger", () => {
    const rows = ["a", "b", "c"].map((name) => row("crew", name, name));
    expect(groupTeamHandles(rows, { callerId: "me", teamIds: ["crew"], max: 2 }).get("crew")).toEqual({ members: [expect.objectContaining({ handle: "a" }), expect.objectContaining({ handle: "b" })], cut: true });
    expect(groupTeamHandles(rows, { callerId: "c", teamIds: ["crew"], max: 2 }).get("crew")?.cut).toBe(false);
  });
});

describe("memberRole", () => {
  it("should give the role that applies, as effectiveRoleKey decides it, with a custom role's name", () => {
    expect(memberRole({ role: "admin", customKey: null, customName: null, isAgent: false })).toEqual({ roleKey: "admin" });
    expect(memberRole({ role: "member", customKey: "reviewer", customName: "Reviewer", isAgent: false })).toEqual({ roleKey: "reviewer", customRoleName: "Reviewer" });
    expect(memberRole({ role: "member", customKey: "reviewer", customName: "Reviewer", isAgent: true })).toEqual({ roleKey: "agent" });
  });

  it("should never let a custom assignment named like a built-in role stand in for it", () => {
    expect(memberRole({ role: "member", customKey: "owner", customName: "Owner", isAgent: false })).toEqual({ roleKey: "member" });
  });
});

describe("teamHandlesQuery", () => {
  const db = drizzle({ client: neon(fakeDatabaseUrl()) });

  it("should filter by the one team and join users and agents on the member, never a column with itself", () => {
    const { sql, params } = teamHandlesQuery(db, "crew", 10).toSQL();
    expect(sql).toContain('inner join "user" on "user"."id" = "team_member"."user_id"');
    expect(sql).toContain('left join "agent" on "agent"."user_id" = "team_member"."user_id"');
    expect(sql).toMatch(/where "team_member"\."team_id" = \$1/);
    expect(sql).not.toMatch(/"(\w+)" = "\1"(?!\.)/);
    expect(sql).not.toContain('"email"');
    // The custom role is the member's own, in this team; the owner is the agent's.
    expect(sql).toContain('"assigned_role"."team_id" = "team_member"."team_id"');
    expect(sql).toContain('left join "user" "agent_owner" on "agent_owner"."id" = "agent"."owner_id"');
    expect(params).toContain("crew");
  });
});
