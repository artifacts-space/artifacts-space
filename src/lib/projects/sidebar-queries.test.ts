import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { project } from "@/db/schema";

import type * as ScopeModule from "./scope";

/*
 * The sidebar's project rows. Projects are team-internal, so these tests
 * read the SQL itself: a list may only load the viewer's own projects and
 * those of shared teams they belong to.
 */

const db = drizzle({ client: neon("postgres://user:password@db.example.com/db") });
const teams = vi.hoisted(() => ({ ids: new Set<string>() }));

vi.mock("@/db", () => ({ getDb: () => db }));
vi.mock("./scope", async (importOriginal) => ({
  ...(await importOriginal<typeof ScopeModule>()),
  sharedTeamIdsFor: () => Promise.resolve(teams.ids),
}));

const { listSidebarProjects, sidebarProjectCondition } = await import("./sidebar-queries");

async function whereSql(viewerId: string, scope: Parameters<typeof sidebarProjectCondition>[1]) {
  const condition = await sidebarProjectCondition(viewerId, scope);
  if (!condition) return null;
  return db.select({ id: project.id }).from(project).where(condition).toSQL();
}

beforeEach(() => {
  teams.ids = new Set();
});

describe("sidebarProjectCondition", () => {
  it("should load nothing when the viewer is not in the team whose tab it is", async () => {
    teams.ids = new Set(["acme"]);
    expect(await sidebarProjectCondition("viewer-1", { kind: "team", teamId: "other-team" })).toBeNull();
    await expect(listSidebarProjects("viewer-1", { kind: "team", teamId: "other-team" })).resolves.toEqual([]);
  });

  it("should load only the team's projects when a member opens the team tab", async () => {
    teams.ids = new Set(["acme"]);
    const query = await whereSql("viewer-1", { kind: "team", teamId: "acme" });
    expect(query?.sql).toBe('select "id" from "project" where "project"."team_id" = $1');
    expect(query?.params).toEqual(["acme"]);
  });

  it("should load only the viewer's own projects when they are in no shared team", async () => {
    const query = await whereSql("viewer-1", { kind: "mine" });
    expect(query?.sql).toBe('select "id" from "project" where "project"."user_id" = $1');
    expect(query?.params).toEqual(["viewer-1"]);
  });

  it("should add only the viewer's shared teams when they belong to some", async () => {
    teams.ids = new Set(["acme", "globex"]);
    const query = await whereSql("viewer-1", { kind: "mine" });
    expect(query?.sql).toBe('select "id" from "project" where ("project"."user_id" = $1 or "project"."team_id" in ($2, $3))');
    expect(query?.params).toEqual(["viewer-1", "acme", "globex"]);
  });
});
