import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * Which artifacts each workspace lists, against a real Postgres. Every
 * artifact has one home: the shared team it is shared through, else its
 * author. Personal lists what the viewer wrote whose home is not one of
 * their shared teams; a team's workspace lists what is shared through the
 * team. No artifact the viewer wrote is in both, and none is in neither.
 * Runs only when TEST_DATABASE_URL names a throwaway local database with the
 * migrations applied; never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

describe.runIf(Boolean(databaseUrl))("workspace lists with a database", async () => {
  const { inArray } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifact, team, teamMember, user } = await import("@/db/schema");
  const { listArtifacts, listProjectFacets } = await import("@/lib/artifacts");

  const tag = randomUUID().slice(0, 8);
  const id = (name: string) => `home-${tag}-${name}`;
  const viewer = id("viewer");
  const teammate = id("teammate");
  // The viewer's personal team, the shared team they are in, and a shared team they left.
  const own = id("own-team");
  const crew = id("crew");
  const left = id("left");
  const mine = ["private", "team-crew", "link-crew", "link-own", "public-no-team", "team-left"];
  const artifactIds = [...mine, "teammates"].map(id);

  type Visibility = "private" | "team" | "link" | "public";
  const row = (key: string, values: { userId: string; visibility: Visibility; teamId?: string }) => ({
    id: id(key),
    userId: values.userId,
    updatedBy: values.userId,
    title: `${tag} ${key}`,
    content: "",
    kind: "text" as const,
    visibility: values.visibility,
    teamId: values.teamId ?? null,
    shareId: randomUUID().replaceAll("-", ""),
  });

  beforeAll(async () => {
    const db = getDb();
    await db.insert(user).values([viewer, teammate].map((userId) => ({ id: userId, name: userId, email: `${userId}@example.com` })));
    await db.insert(team).values([
      { id: own, name: "Own", slug: own, personal: true },
      { id: crew, name: "Crew", slug: crew, personal: false },
      { id: left, name: "Left", slug: left, personal: false },
    ]);
    await db.insert(teamMember).values([
      { id: id("m-viewer-own"), teamId: own, userId: viewer, role: "owner" },
      { id: id("m-viewer-crew"), teamId: crew, userId: viewer, role: "member" },
      { id: id("m-teammate-crew"), teamId: crew, userId: teammate, role: "owner" },
      { id: id("m-teammate-left"), teamId: left, userId: teammate, role: "owner" },
    ]);
    await db.insert(artifact).values([
      row("private", { userId: viewer, visibility: "private" }),
      row("team-crew", { userId: viewer, visibility: "team", teamId: crew }),
      // A link or public artifact approved by a shared team has that team as its home too.
      row("link-crew", { userId: viewer, visibility: "link", teamId: crew }),
      row("link-own", { userId: viewer, visibility: "link", teamId: own }),
      row("public-no-team", { userId: viewer, visibility: "public" }),
      // Shared through a team the viewer is no longer in, and not handed to an owner yet.
      row("team-left", { userId: viewer, visibility: "team", teamId: left }),
      row("teammates", { userId: teammate, visibility: "team", teamId: crew }),
    ]);
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(artifact).where(inArray(artifact.id, artifactIds));
    await db.delete(team).where(inArray(team.id, [own, crew, left]));
    await db.delete(user).where(inArray(user.id, [viewer, teammate]));
  });

  const listed = async (scope: Parameters<typeof listArtifacts>[1]) => (await listArtifacts(viewer, scope)).map((item) => item.id).sort();
  const ids = (...keys: string[]) => keys.map(id).sort();

  it("should list in Personal only what the viewer wrote whose home is not one of their shared teams", async () => {
    // Never "team-crew" or "link-crew": their home is Crew, whose workspace lists them.
    expect(await listed({ scope: { kind: "personal" } })).toEqual(ids("private", "link-own", "public-no-team", "team-left"));
  });

  it("should list in the team's workspace everything shared through the team, the viewer's own included", async () => {
    expect(await listed({ scope: { kind: "team", teamId: crew } })).toEqual(ids("team-crew", "link-crew", "teammates"));
  });

  it("should list every artifact the viewer wrote in exactly one workspace, never both and never neither", async () => {
    const personal = await listed({ scope: { kind: "personal" } });
    const inCrew = await listed({ scope: { kind: "team", teamId: crew } });
    for (const key of mine) {
      const places = [personal, inCrew].filter((list) => list.includes(id(key))).length;
      expect(places, key).toBe(1);
    }
  });

  it("should keep an artifact in Personal when it is shared through a team the viewer is no longer in", async () => {
    expect(await listed({ scope: { kind: "personal" } })).toContain(id("team-left"));
    expect(await listed({ scope: { kind: "team", teamId: left } })).toEqual([]);
  });

  it("should count each workspace by the same rule as its list", async () => {
    const personal = await listProjectFacets(viewer, { kind: "personal" });
    expect(personal.total).toBe(4);
    expect(personal.public).toBe(1);
    // Shared with me counts others' artifacts: none in Personal, the teammate's one in Crew.
    expect(personal.shared).toBe(0);
    const inCrew = await listProjectFacets(viewer, { kind: "team", teamId: crew });
    expect(inCrew.total).toBe(3);
    expect(inCrew.shared).toBe(1);
  });

  it("should not find an artifact of the team's workspace when Personal is searched", async () => {
    expect(await listed({ scope: { kind: "personal" }, query: `${tag} team-crew` })).toEqual([]);
    expect(await listed({ scope: { kind: "team", teamId: crew }, query: `${tag} team-crew` })).toEqual(ids("team-crew"));
  });

  it("should still list everything the viewer wrote, whatever its home, for agents", async () => {
    expect(await listed({ scope: { kind: "mine" } })).toEqual(ids(...mine));
  });
});
