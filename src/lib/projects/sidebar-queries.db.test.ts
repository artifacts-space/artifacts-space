import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * The sidebar's project rows against a real Postgres. The viewer's own list
 * holds their projects, the empty ones too, and never a team's, even one
 * that holds an artifact the viewer shared with that team; a team's
 * projects are on the team's tab. Runs only when TEST_DATABASE_URL names a throwaway local
 * database with the migrations applied; never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

describe.runIf(Boolean(databaseUrl))("sidebar project rows with a database", async () => {
  const { inArray } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifact, project, team, teamMember, user } = await import("@/db/schema");
  const { listSidebarProjects } = await import("./sidebar-queries");

  const tag = randomUUID().slice(0, 8);
  const id = (name: string) => `rows-${tag}-${name}`;
  const viewer = id("viewer");
  const teammate = id("teammate");
  // The viewer and the teammate are in `crew`; only the teammate is in `outside`.
  const crew = id("crew");
  const outside = id("outside");
  const projectIds = ["own", "own-empty", "crew-mine", "crew-theirs", "crew-empty", "outside"].map(id);
  const artifactIds = ["private", "shared", "teammates"].map(id);

  const row = (key: string, values: { userId: string; projectId: string; teamId?: string }) => ({
    id: id(key),
    userId: values.userId,
    updatedBy: values.userId,
    title: key,
    content: "",
    kind: "text" as const,
    visibility: values.teamId ? ("team" as const) : ("private" as const),
    teamId: values.teamId ?? null,
    projectId: values.projectId,
    shareId: randomUUID().replaceAll("-", ""),
  });

  beforeAll(async () => {
    const db = getDb();
    await db.insert(user).values([viewer, teammate].map((userId) => ({ id: userId, name: userId, email: `${userId}@example.com` })));
    await db.insert(team).values([
      { id: crew, name: "Crew", slug: crew, personal: false },
      { id: outside, name: "Outside", slug: outside, personal: false },
    ]);
    await db.insert(teamMember).values([
      { id: id("m-viewer-crew"), teamId: crew, userId: viewer, role: "member" },
      { id: id("m-teammate-crew"), teamId: crew, userId: teammate, role: "member" },
      { id: id("m-teammate-outside"), teamId: outside, userId: teammate, role: "owner" },
    ]);
    await db.insert(project).values([
      { id: id("own"), userId: viewer, name: "Own", nameKey: "own" },
      { id: id("own-empty"), userId: viewer, name: "Own empty", nameKey: "own empty" },
      { id: id("crew-mine"), teamId: crew, name: "Crew with mine", nameKey: "crew with mine" },
      { id: id("crew-theirs"), teamId: crew, name: "Crew with theirs", nameKey: "crew with theirs" },
      { id: id("crew-empty"), teamId: crew, name: "Crew empty", nameKey: "crew empty" },
      { id: id("outside"), teamId: outside, name: "Outside", nameKey: "outside" },
    ]);
    await db.insert(artifact).values([
      row("private", { userId: viewer, projectId: id("own") }),
      row("shared", { userId: viewer, projectId: id("crew-mine"), teamId: crew }),
      row("teammates", { userId: teammate, projectId: id("crew-theirs"), teamId: crew }),
    ]);
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(artifact).where(inArray(artifact.id, artifactIds));
    await db.delete(project).where(inArray(project.id, projectIds));
    await db.delete(team).where(inArray(team.id, [crew, outside]));
    await db.delete(user).where(inArray(user.id, [viewer, teammate]));
  });

  const names = async (viewerId: string, scope: Parameters<typeof listSidebarProjects>[1]) => (await listSidebarProjects(viewerId, scope)).map((item) => item.name);

  it("should list only the viewer's own projects in their own list, never a team's", async () => {
    // Never a project of Crew, not even "Crew with mine", which holds an artifact the viewer shared with Crew.
    expect(await names(viewer, { kind: "mine" })).toEqual(["Own", "Own empty"]);
  });

  it("should list every project of the team, the empty ones too, on the team's tab", async () => {
    expect(await names(viewer, { kind: "team", teamId: crew })).toEqual(["Crew empty", "Crew with mine", "Crew with theirs"]);
  });

  it("should list nothing of a team the viewer is not in", async () => {
    expect(await names(viewer, { kind: "team", teamId: outside })).toEqual([]);
    expect(await names(viewer, { kind: "mine" })).not.toContain("Outside");
  });
});
