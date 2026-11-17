import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { artifact } from "@/db/schema";
import { fakeDatabaseUrl } from "@/test/fake-database-url";

import type * as ScopeModule from "./projects/scope";

/*
 * Which artifacts a workspace lists. Every list, count, search, and filter
 * builds on scopeCondition, so these tests read its SQL: Personal never
 * holds what is shared through one of the viewer's shared teams, and a
 * team's workspace holds only what is shared through that team.
 */

const db = drizzle({ client: neon(fakeDatabaseUrl()) });
const teams = vi.hoisted(() => ({ ids: new Set<string>() }));

vi.mock("@/db", () => ({ getDb: () => db }));
vi.mock("./projects/scope", async (importOriginal) => ({
  ...(await importOriginal<typeof ScopeModule>()),
  sharedTeamIdsFor: () => Promise.resolve(teams.ids),
}));

const { projectScopeOf, scopeCondition } = await import("./artifact-list-scope");

async function whereSql(scope: Parameters<typeof scopeCondition>[1]) {
  return db.select({ id: artifact.id }).from(artifact).where(await scopeCondition("viewer-1", scope)).toSQL();
}

/** "The viewer wrote it, or an agent they act for did" (authoredByViewerCondition); its three parameters are $1 to $3. */
const authored =
  '("artifact"."user_id" = $1 or "artifact"."user_id" in ' +
  '(select "agent"."user_id" from "agent" inner join "team_member" on ("team_member"."team_id" = "agent"."team_id" and "team_member"."user_id" = $2) where "agent"."owner_id" = $3))';

beforeEach(() => {
  teams.ids = new Set();
});

describe("scopeCondition", () => {
  it("should hold everything the viewer wrote in Personal when they are in no shared team", async () => {
    const query = await whereSql({ kind: "personal" });
    expect(query.sql).toBe(`select "id" from "artifact" where ${authored}`);
    expect(query.params).toEqual(["viewer-1", "viewer-1", "viewer-1"]);
  });

  it("should leave out of Personal what the viewer shared through one of their shared teams", async () => {
    teams.ids = new Set(["acme", "globex"]);
    const query = await whereSql({ kind: "personal" });
    // Private, or no team, or another team. Never `team_id not in (...)` alone: that is unknown for an artifact with no team, and would drop it.
    expect(query.sql).toBe(
      `select "id" from "artifact" where (${authored} and ` +
        '("artifact"."visibility" = $4 or "artifact"."team_id" is null or "artifact"."team_id" not in ($5, $6)))',
    );
    expect(query.params).toEqual(["viewer-1", "viewer-1", "viewer-1", "private", "acme", "globex"]);
  });

  it("should keep everything the viewer wrote, whatever its home, in the list agents read", async () => {
    teams.ids = new Set(["acme"]);
    const query = await whereSql({ kind: "mine" });
    expect(query.sql).toBe(`select "id" from "artifact" where ${authored}`);
  });

  it("should hold only what is shared through the team, for a member, in a team's workspace", async () => {
    const query = await whereSql({ kind: "team", teamId: "acme" });
    expect(query.sql).toBe(
      'select "id" from "artifact" where ("artifact"."team_id" = $1 and "artifact"."visibility" <> $2 and exists ' +
        '(select "id" from "team_member" where ("team_member"."team_id" = $3 and "team_member"."user_id" = $4)))',
    );
    expect(query.params).toEqual(["acme", "private", "acme", "viewer-1"]);
  });
});

describe("projectScopeOf", () => {
  it("should read projects for Personal as for everything the viewer wrote, and a team's as the team's", () => {
    expect(projectScopeOf({ kind: "personal" })).toEqual({ kind: "mine" });
    expect(projectScopeOf({ kind: "mine" })).toEqual({ kind: "mine" });
    expect(projectScopeOf({ kind: "team", teamId: "acme" })).toEqual({ kind: "team", teamId: "acme" });
  });
});
