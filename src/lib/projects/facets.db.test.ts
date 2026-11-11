import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * The sidebar's counts against a real Postgres: the facets count every
 * artifact in a scope, Unfiled holds exactly what no usable project holds
 * (so its count and the Unfiled filter's rows agree), and Shared with me
 * and Public are counted in the database, not over the newest 100. Runs only
 * when TEST_DATABASE_URL names a throwaway local database with the
 * migrations applied; never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

describe.runIf(Boolean(databaseUrl))("project facets with a database", async () => {
  const { inArray } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifact, project, team, teamMember, user } = await import("@/db/schema");
  const { listArtifacts, listProjectFacets } = await import("@/lib/artifacts");

  const tag = randomUUID().slice(0, 8);
  const id = (name: string) => `facets-${tag}-${name}`;
  const viewer = id("viewer");
  const other = id("other");
  // The viewer is not in `outside`, so its project is not theirs to use; they are in `crew`.
  const outside = id("outside");
  const crew = id("crew");
  const artifactIds = ["filed", "loose-1", "loose-2", "elsewhere", "crew-note"].map(id);

  const row = (key: string, values: { userId: string; projectId?: string; teamId?: string; visibility?: "private" | "team" | "public" }) => ({
    id: id(key),
    userId: values.userId,
    updatedBy: values.userId,
    title: key,
    content: "",
    kind: "text" as const,
    visibility: values.visibility ?? "private",
    teamId: values.teamId ?? null,
    projectId: values.projectId ?? null,
    shareId: randomUUID().replaceAll("-", ""),
  });

  beforeAll(async () => {
    const db = getDb();
    await db.insert(user).values([viewer, other].map((userId) => ({ id: userId, name: userId, email: `${userId}@example.com` })));
    await db.insert(team).values([
      { id: outside, name: "Outside", slug: outside, personal: false },
      { id: crew, name: "Crew", slug: crew, personal: false },
    ]);
    await db.insert(teamMember).values([
      { id: id("m-other-outside"), teamId: outside, userId: other, role: "owner" },
      { id: id("m-viewer-crew"), teamId: crew, userId: viewer, role: "member" },
      { id: id("m-other-crew"), teamId: crew, userId: other, role: "member" },
    ]);
    await db.insert(project).values([
      { id: id("own"), userId: viewer, name: "Own", nameKey: "own" },
      { id: id("theirs"), teamId: outside, name: "Theirs", nameKey: "theirs" },
    ]);
    await db.insert(artifact).values([
      row("filed", { userId: viewer, projectId: id("own"), visibility: "public" }),
      row("loose-1", { userId: viewer }),
      row("loose-2", { userId: viewer }),
      // A project the viewer cannot use in their own list: it counts as Unfiled there.
      row("elsewhere", { userId: viewer, projectId: id("theirs") }),
      row("crew-note", { userId: other, teamId: crew, visibility: "team" }),
    ]);
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(artifact).where(inArray(artifact.id, artifactIds));
    await db.delete(project).where(inArray(project.id, [id("own"), id("theirs")]));
    await db.delete(team).where(inArray(team.id, [outside, crew]));
    await db.delete(user).where(inArray(user.id, [viewer, other]));
  });

  it("should count Unfiled as every artifact no usable project holds, matching the Unfiled filter's rows", async () => {
    const facets = await listProjectFacets(viewer, { kind: "mine" });
    expect(facets.total).toBe(4);
    expect(facets.projects).toEqual([expect.objectContaining({ key: "own", count: 1 })]);
    expect(facets.none).toBe(3);
    const unfiled = await listArtifacts(viewer, { project: { none: true } });
    expect(unfiled.map((item) => item.id).sort()).toEqual([id("elsewhere"), id("loose-1"), id("loose-2")].sort());
  });

  it("should count Public in the database, and nothing as shared on the viewer's own list", async () => {
    const facets = await listProjectFacets(viewer, { kind: "mine" });
    expect(facets.public).toBe(1);
    expect(facets.shared).toBe(0);
  });

  it("should count an artifact someone else shared with the team as Shared with me", async () => {
    const facets = await listProjectFacets(viewer, { kind: "team", teamId: crew });
    expect(facets.total).toBe(1);
    expect(facets.shared).toBe(1);
  });
});
