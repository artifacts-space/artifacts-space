import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";

import { agentLockedCapabilities, agentLockedCapabilityList, teamCapabilities } from "./capability-rules";
import { capabilityHolderTeamQuery } from "./capability-sql";

/*
 * The capability check as SQL runs inside single-table updates, where an
 * unqualified column would bind to the outer table (the AGENTS.md
 * tripwire). These tests read the SQL itself; capability-sql.db.test.ts
 * runs it against a real database.
 */

const db = drizzle({ client: neon("postgres://user:password@db.example.com/db") });
const query = () => capabilityHolderTeamQuery(db, "person-1", "team-1", "approve.sharing").toSQL();

describe("capabilityHolderTeamQuery", () => {
  it("should filter on this person and this team when it builds the check", () => {
    const { sql, params } = query();
    expect(sql).toMatch(/"team_member"\."user_id" = \$\d+/);
    expect(sql).toMatch(/"team_member"\."team_id" = \$\d+/);
    expect(params).toContain("person-1");
    expect(params).toContain("team-1");
  });

  it("should refuse personal teams and agents when it builds the check", () => {
    const { sql } = query();
    expect(sql).toMatch(/"team"\."personal" = \$\d+/);
    expect(sql).toContain('"agent"."user_id" is null');
  });

  it("should look for the capability on the role that applies in the same team when it builds the check", () => {
    const { sql, params } = query();
    expect(sql).toContain('"assigned_role"."team_id" = "team_member"."team_id"');
    expect(sql).toContain('"held_role"."team_id" = "team_member"."team_id"');
    expect(sql).toMatch(/"held_capability"\."capability" = \$\d+/);
    expect(params).toContain("approve.sharing");
  });

  it("should require an owner, the capability on the role, or a built-in default that grants it when it builds the check", () => {
    const { sql, params } = query();
    const where = sql.slice(sql.lastIndexOf(" where "));
    expect(where).toMatch(/end\) = \$\d+ or "held_capability"\."role_id" is not null or \("held_role"\."id" is null and \(case .* end\) in \(\$\d+, \$\d+\)\)/);
    expect(params.slice(-2)).toEqual(["owner", "admin"]);
  });

  it("should never compare a column with itself when it builds the check", () => {
    const { sql } = query();
    expect(sql).not.toMatch(/(^|[^."])"(user_id|team_id|id|role_id|key)" = "\2"/);
    expect(sql).not.toMatch(/[\s(]"(user_id|team_id|role|key|personal)"(?!\.)/);
  });

  it("should build the check for every capability agents can never hold", () => {
    for (const capability of agentLockedCapabilityList) {
      expect(capabilityHolderTeamQuery(db, "person-1", "team-1", capability).toSQL().params).toContain(capability);
    }
  });

  it("should throw when asked about a capability agents may hold", () => {
    // Excluding agents would refuse analytics.view where can() allows it, so the type rejects it and so does the query.
    // @ts-expect-error -- analytics.view is not an agent-locked capability
    expect(() => capabilityHolderTeamQuery(db, "person-1", "team-1", "analytics.view")).toThrow(/agents can never hold/);
  });

  it("should leave only analytics.view outside the capabilities it accepts", () => {
    expect(teamCapabilities.filter((capability) => !agentLockedCapabilities.has(capability))).toEqual(["analytics.view"]);
  });
});
