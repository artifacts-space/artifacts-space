import { neon } from "@neondatabase/serverless";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it, vi } from "vitest";

import { artifact, project } from "@/db/schema";

import type * as ScopeModule from "./scope";

/*
 * The project filter and search add uncorrelated subqueries to a
 * single-table artifact select. These tests read the SQL itself (see the
 * tripwire in AGENTS.md): the subquery must stay inside the viewer's
 * usable scopes and never compare a column with itself.
 */

const db = drizzle({ client: neon("postgres://user:password@db.example.com/db") });
const teams = vi.hoisted(() => ({ ids: new Set<string>() }));

vi.mock("@/db", () => ({ getDb: () => db }));
vi.mock("./scope", async (importOriginal) => ({
  ...(await importOriginal<typeof ScopeModule>()),
  sharedTeamIdsFor: () => Promise.resolve(teams.ids),
}));

const { facetJoinCondition, projectFilterCondition, projectSearchCondition } = await import("./queries");

function listSql(condition: Parameters<typeof and>[0]) {
  return db.select({ id: artifact.id }).from(artifact).where(and(eq(artifact.userId, "viewer-1"), condition)).toSQL();
}

describe("projectFilterCondition", () => {
  it("should limit a mine-scope filter to the viewer's own and shared teams' projects with that key", async () => {
    teams.ids = new Set(["team-a"]);
    const { sql, params } = listSql(await projectFilterCondition("viewer-1", { kind: "mine" }, { key: "billing" }));
    expect(sql).toMatch(/"project_id" in \(select "id" from "project" where/);
    expect(sql).toContain('"name_key" = $');
    expect(params).toEqual(expect.arrayContaining(["viewer-1", "team-a", "billing"]));
    expect(sql).not.toMatch(/"(\w+)" = "\1"/);
  });

  it("should use only the viewer's own projects when they are in no shared team", async () => {
    teams.ids = new Set();
    const { sql } = listSql(await projectFilterCondition("viewer-1", { kind: "mine" }, { key: "billing" }));
    expect(sql).not.toContain('"team_id" in');
  });

  it("should limit a team-scope filter to that team's projects", async () => {
    const { sql, params } = listSql(await projectFilterCondition("viewer-1", { kind: "team", teamId: "team-b" }, { key: "docs" }));
    expect(sql).toContain('"team_id" = $');
    expect(params).toEqual(expect.arrayContaining(["team-b", "docs"]));
  });

  it("should match artifacts without a project when the filter is none", async () => {
    const { sql } = listSql(await projectFilterCondition("viewer-1", { kind: "mine" }, { none: true }));
    expect(sql).toContain('"project_id" is null');
  });
});

describe("facetJoinCondition", () => {
  it("should count only projects in the viewer's usable scopes when the list is the viewer's own", async () => {
    teams.ids = new Set(["team-a"]);
    const join = await facetJoinCondition("viewer-1", { kind: "mine" });
    const { sql, params } = db.select({ id: artifact.id }).from(artifact).innerJoin(project, join).toSQL();
    expect(sql).toContain('"project"."id" = "artifact"."project_id"');
    expect(params).toEqual(expect.arrayContaining(["viewer-1", "team-a"]));
  });

  it("should count only the team's projects when the list is a team's", async () => {
    const join = await facetJoinCondition("viewer-1", { kind: "team", teamId: "team-b" });
    const { sql, params } = db.select({ id: artifact.id }).from(artifact).innerJoin(project, join).toSQL();
    expect(sql).toContain('"team_id" = $');
    expect(params).toEqual(["team-b"]);
  });
});

describe("projectSearchCondition", () => {
  it("should search project names only among the viewer's usable projects", async () => {
    teams.ids = new Set();
    const { sql, params } = listSql(await projectSearchCondition("viewer-1", { kind: "mine" }, "%bill%"));
    expect(sql).toMatch(/"name" ilike \$/);
    expect(params).toEqual(expect.arrayContaining(["viewer-1", "%bill%"]));
  });
});
