import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { project } from "@/db/schema";
import { fakeDatabaseUrl } from "@/test/fake-database-url";

import type * as ScopeModule from "./scope";

/*
 * The sidebar's project rows. Projects are team-internal, so these tests
 * read the SQL itself: the viewer's own list loads only their own projects,
 * and a team's tab only that team's, for a member.
 */

const db = drizzle({ client: neon(fakeDatabaseUrl()) });
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

  it("should load only the viewer's own projects into their own list, however many shared teams they are in", async () => {
    teams.ids = new Set(["acme", "globex"]);
    const query = await whereSql("viewer-1", { kind: "mine" });
    // On main this was `user_id = $1 or team_id in ($2, $3)`: every project of every team they are in.
    expect(query?.sql).toBe('select "id" from "project" where "project"."user_id" = $1');
    expect(query?.params).toEqual(["viewer-1"]);
  });
});
