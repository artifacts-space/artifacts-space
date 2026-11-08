import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";

import { artifact } from "@/db/schema";

import { authoredByViewerCondition, ownedAgentIdsQuery } from "./owner-access";

/*
 * Who acts for an agent decides who reads its private artifacts, so these
 * tests read the generated SQL (as src/lib/access-subject.test.ts does):
 * stubbed rows cannot catch a join that matches the wrong people.
 */

const db = drizzle({ client: neon("postgres://user:password@db.example.com/db") });

describe("ownedAgentIdsQuery", () => {
  it("should match only agents the viewer added when it lists the agents they act for", () => {
    const { sql, params } = ownedAgentIdsQuery(db, "owner-1").toSQL();
    expect(sql).toMatch(/where "agent"\."owner_id" = \$\d+/);
    expect(params).toEqual(["owner-1", "owner-1"]);
  });

  it("should require the viewer to still be in the agent's own team when they act for it", () => {
    const { sql } = ownedAgentIdsQuery(db, "owner-1").toSQL();
    expect(sql).toMatch(/inner join "team_member" on \("team_member"\."team_id" = "agent"\."team_id" and "team_member"\."user_id" = \$\d+\)/);
  });

  it("should narrow to one agent and still require ownership when it checks one author", () => {
    const { sql, params } = ownedAgentIdsQuery(db, "owner-1", "agent-1").toSQL();
    expect(sql).toMatch(/"agent"\."owner_id" = \$\d+ and "agent"\."user_id" = \$\d+/);
    expect(params).toEqual(["owner-1", "owner-1", "agent-1"]);
  });
});

describe("authoredByViewerCondition", () => {
  const listSql = () => db.select({ id: artifact.id }).from(artifact).where(authoredByViewerCondition(db, "owner-1")).toSQL();

  it("should list the viewer's own artifacts and their agents' when the scope is mine", () => {
    const { sql } = listSql();
    expect(sql).toMatch(/"artifact"\."user_id" = \$\d+ or "artifact"\."user_id" in \(select "agent"\."user_id" from "agent" inner join "team_member"/);
  });

  it("should never compare a column with itself when the subquery runs inside a single-table select", () => {
    const { sql } = listSql();
    expect(sql).not.toMatch(/"team_id" = "team_id"|"user_id" = "user_id"|"owner_id" = "owner_id"/);
    expect(sql).toContain('"team_member"."team_id" = "agent"."team_id"');
  });

  it("should bind every condition to the viewer when it builds the list", () => {
    const { params } = listSql();
    expect(params).toEqual(["owner-1", "owner-1", "owner-1"]);
  });
});
