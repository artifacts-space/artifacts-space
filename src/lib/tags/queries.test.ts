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

const { homeScopeCondition, tagFilterCondition, tagSearchCondition, tagsForViewer, tagsVisibleCondition } = await import("./queries");

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
  it("should need every tag when several are chosen", () => {
    const { sql, params } = listSql(tagFilterCondition(["launch", "q4"]));
    expect(sql).toContain('"tags" @> $');
    expect(params).toContain('{"launch","q4"}');
  });
});

describe("tagSearchCondition", () => {
  it("should search tags only among artifacts whose tags the viewer may see", async () => {
    teams.ids = new Set();
    const { sql, params } = listSql(await tagSearchCondition("viewer-1", "%lau%"));
    expect(sql).toContain("array_to_string(\"artifact\".\"tags\", ' ') ilike $");
    expect(params).toEqual(["viewer-1", "viewer-1", "%lau%"]);
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
