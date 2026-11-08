import { neon } from "@neondatabase/serverless";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it, vi } from "vitest";

import { artifact } from "@/db/schema";
import type * as ScopeModule from "@/lib/projects/scope";

/*
 * Tag reads. The conditions are read as SQL (see the tripwire in AGENTS.md):
 * they must keep tags to the author and the shared teams an artifact is
 * shared through, and never compare a column with itself.
 */

const db = drizzle({ client: neon("postgres://user:password@db.example.com/db") });
const teams = vi.hoisted(() => ({ ids: new Set<string>() }));

vi.mock("@/db", () => ({ getDb: () => db }));
vi.mock("@/lib/projects/scope", async (importOriginal) => ({
  ...(await importOriginal<typeof ScopeModule>()),
  sharedTeamIdsFor: () => Promise.resolve(teams.ids),
}));

const { distinctTagCountQuery, homeScopeCondition, knownTagsQuery, tagCountsQuery, tagFilterCondition, tagSearchCondition, tagsForViewer, tagsVisibleCondition } = await import("./queries");

function listSql(condition: Parameters<typeof and>[0]) {
  return db.select({ id: artifact.id }).from(artifact).where(and(eq(artifact.userId, "viewer-1"), condition)).toSQL();
}

const selfCompare = /"(\w+)" = "\1"/;

describe("tagsVisibleCondition", () => {
  it("should allow only the viewer's own artifacts when they are in no shared team", async () => {
    teams.ids = new Set();
    const { sql, params } = listSql(await tagsVisibleCondition("viewer-1"));
    expect(sql).not.toContain('"team_id" in');
    expect(params).toEqual(["viewer-1", "viewer-1"]);
  });

  it("should add non-private artifacts of the viewer's shared teams and nothing else", async () => {
    teams.ids = new Set(["team-a"]);
    const { sql, params } = listSql(await tagsVisibleCondition("viewer-1"));
    expect(sql).toContain('"visibility" <> $');
    expect(sql).toContain('"team_id" in ($');
    expect(params).toEqual(expect.arrayContaining(["private", "team-a"]));
    expect(sql).not.toMatch(selfCompare);
  });
});

describe("homeScopeCondition", () => {
  it("should hold a team's non-private artifacts when the scope is a team", () => {
    const { sql, params } = listSql(homeScopeCondition({ kind: "team", teamId: "team-b" }));
    expect(sql).toContain('"team_id" = $');
    expect(sql).toContain('"visibility" <> $');
    expect(params).toEqual(expect.arrayContaining(["team-b", "private"]));
  });

  it("should hold the author's private artifacts and those in no team or a personal one when the scope is a person", () => {
    const { sql, params } = listSql(homeScopeCondition({ kind: "user", userId: "author-1" }));
    expect(sql).toContain('"team_id" is null');
    expect(sql).toMatch(/"team_id" in \(select "id" from "team" where "team"."personal" = \$\d+\)/);
    expect(params).toEqual(expect.arrayContaining(["author-1", "private", true]));
    expect(sql).not.toMatch(selfCompare);
  });
});

describe("tagFilterCondition", () => {
  it("should need every tag and keep to artifacts whose tags the viewer may see when several are chosen", async () => {
    teams.ids = new Set();
    const { sql, params } = listSql(await tagFilterCondition("viewer-1", ["launch", "q4"]));
    expect(sql).toContain('"tags" @> $');
    expect(params.filter((value) => value === "viewer-1")).toHaveLength(2);
    expect(params).toContain('{"launch","q4"}');
  });
});

describe("tagSearchCondition", () => {
  it("should search tags only among artifacts whose tags the viewer may see", async () => {
    teams.ids = new Set();
    const { sql, params } = listSql(await tagSearchCondition("viewer-1", "%lau%"));
    expect(sql).toContain("array_to_string(\"artifact\".\"tags\", E'\\n') ilike $");
    expect(params).toEqual(["viewer-1", "viewer-1", "%lau%"]);
  });
});

describe("tag count queries", () => {
  const scope = homeScopeCondition({ kind: "team", teamId: "team-b" });

  it("should count tag uses from the scope's artifacts only, most used first", () => {
    const { sql, params } = tagCountsQuery(scope, 200).toSQL();
    expect(sql).toMatch(/from \(select unnest\("tags"\) as "tag" from "artifact" where/);
    expect(sql).toContain('group by "tag" order by count(*) desc');
    expect(params).toEqual(expect.arrayContaining(["team-b", "private", 200]));
    expect(sql).not.toMatch(selfCompare);
  });

  it("should count distinct tags and look up known ones inside the same scope", () => {
    expect(distinctTagCountQuery(scope).toSQL().sql).toContain('count(distinct "tag")');
    const known = knownTagsQuery(scope, ["launch"]).toSQL();
    expect(known.sql).toMatch(/select distinct "tag" from \(select unnest/);
    expect(known.params).toEqual(expect.arrayContaining(["team-b", "launch"]));
    expect(known.sql).not.toMatch(selfCompare);
  });
});

describe("tagsForViewer", () => {
  const base = { visibility: "link" as const, teamId: "team-a", tags: ["secret-tag"] };

  it("should show tags to the author", async () => {
    teams.ids = new Set();
    const result = await tagsForViewer([{ id: "a1", userId: "viewer-1", ...base }], "viewer-1");
    expect(result.get("a1")).toEqual(["secret-tag"]);
  });

  it("should show tags to a member of the shared team the artifact is shared through", async () => {
    teams.ids = new Set(["team-a"]);
    const result = await tagsForViewer([{ id: "a1", userId: "author", ...base }], "viewer-1");
    expect(result.get("a1")).toEqual(["secret-tag"]);
  });

  it("should hide tags from a reader outside the team of a link artifact", async () => {
    teams.ids = new Set(["team-other"]);
    const result = await tagsForViewer([{ id: "a1", userId: "author", ...base }], "viewer-1");
    expect(result.get("a1")).toEqual([]);
  });

  it("should hide tags of a private artifact from a teammate", async () => {
    teams.ids = new Set(["team-a"]);
    const result = await tagsForViewer([{ id: "a1", userId: "author", ...base, visibility: "private" }], "viewer-1");
    expect(result.get("a1")).toEqual([]);
  });
});
