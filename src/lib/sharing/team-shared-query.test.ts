import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";

import { teamSharedQuery } from "./queries";

/*
 * The shared list joins the approval dates from a grouped subquery. These
 * tests read the SQL itself, so a correlated subquery that compares a column
 * with itself (the AGENTS.md tripwire) cannot slip in.
 */

const db = drizzle({ client: neon("postgres://user:password@db.example.com/db") });

describe("teamSharedQuery", () => {
  it("should limit approvals to the team and join them on the artifact id when it lists shared artifacts", () => {
    const { sql, params } = teamSharedQuery(db, "team-1", 100).toSQL();
    expect(sql).toMatch(/left join \(select "artifact_id", max\("decided_at"\) as "shared_at" from "sharing_request" where \("sharing_request"\."team_id" = \$\d+/);
    expect(sql).toContain('"approvals"."artifact_id" = "artifact"."id"');
    expect(params.filter((value) => value === "team-1")).toHaveLength(2);
  });

  it("should keep the list to the team's non-private artifacts when it filters", () => {
    const { sql } = teamSharedQuery(db, "team-1", 100).toSQL();
    expect(sql).toMatch(/where \("artifact"\."team_id" = \$\d+ and "artifact"\."visibility" <> \$\d+\)/);
    expect(sql).not.toMatch(/"team_id" = "team_id"/);
    expect(sql).not.toMatch(/"artifact_id" = "artifact_id"/);
  });
});
