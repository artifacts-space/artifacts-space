import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * Leaving a team, against a real Postgres (#219): the preview lists exactly
 * the artifacts the hand-over will move and names the person who will get
 * them, "Move to Personal first" moves only the leaver's own artifacts in
 * that team (into their Personal list, out of the team's), and after the
 * leave the rest belong to the person the preview named. Runs only when
 * TEST_DATABASE_URL names a throwaway local database with the migrations
 * applied; never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

describe.runIf(Boolean(databaseUrl))("leaving a team with a database", async () => {
  const { and, eq, inArray } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifact, team, teamMember, user } = await import("@/db/schema");
  const { listArtifacts } = await import("@/lib/artifacts");
  const { reconcileTeamArtifacts } = await import("@/lib/sharing/transfer");
  const { listUnfindableArtifacts } = await import("@/lib/sharing/unfindable");
  const { leavePreviewFor, moveOwnTeamArtifactsToPersonal, removalFactsFor } = await import("./departure");

  const tag = randomUUID().slice(0, 8);
  const id = (name: string) => `leave-${tag}-${name}`;
  const leaver = id("leaver");
  const firstOwner = id("first-owner");
  const laterOwner = id("later-owner");
  const people = [leaver, firstOwner, laterOwner];
  const crew = id("crew");
  const other = id("other");
  const keys = ["team-a", "team-b", "link-c", "private", "other-team", "owners"];
  const day = (n: number) => new Date(Date.UTC(2026, 0, n));

  type Visibility = "private" | "team" | "link" | "public";
  const row = (key: string, values: { userId: string; visibility: Visibility; teamId?: string; updatedAt: Date }) => ({
    id: id(key),
    userId: values.userId,
    updatedBy: values.userId,
    title: `${tag} ${key}`,
    content: "",
    kind: "text" as const,
    visibility: values.visibility,
    teamId: values.teamId ?? null,
    shareId: randomUUID().replaceAll("-", ""),
    updatedAt: values.updatedAt,
  });

  beforeAll(async () => {
    const db = getDb();
    await db.insert(user).values(people.map((userId) => ({ id: userId, name: userId === firstOwner ? "Ada Lovelace" : userId, username: userId === firstOwner ? `ada-${tag}` : null, email: `${userId}@example.com` })));
    await db.insert(team).values([
      { id: crew, name: "Crew", slug: crew, personal: false },
      { id: other, name: "Other", slug: other, personal: false },
    ]);
    // The leaver joined first of all, but is a member: the heir is the longest-standing owner.
    await db.insert(teamMember).values([
      { id: id("m-leaver"), teamId: crew, userId: leaver, role: "member", createdAt: day(1) },
      { id: id("m-later"), teamId: crew, userId: laterOwner, role: "owner", createdAt: day(5) },
      { id: id("m-first"), teamId: crew, userId: firstOwner, role: "owner", createdAt: day(2) },
      { id: id("m-leaver-other"), teamId: other, userId: leaver, role: "owner", createdAt: day(1) },
    ]);
    await db.insert(artifact).values([
      row("team-a", { userId: leaver, visibility: "team", teamId: crew, updatedAt: day(10) }),
      row("team-b", { userId: leaver, visibility: "team", teamId: crew, updatedAt: day(9) }),
      row("link-c", { userId: leaver, visibility: "link", teamId: crew, updatedAt: day(8) }),
      row("private", { userId: leaver, visibility: "private", updatedAt: day(7) }),
      row("other-team", { userId: leaver, visibility: "team", teamId: other, updatedAt: day(6) }),
      row("owners", { userId: firstOwner, visibility: "team", teamId: crew, updatedAt: day(5) }),
    ]);
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(artifact).where(inArray(artifact.id, keys.map(id)));
    await db.delete(team).where(inArray(team.id, [crew, other]));
    await db.delete(user).where(inArray(user.id, people));
  });

  const ownerOf = async (key: string) => (await getDb().select({ userId: artifact.userId, originalAuthorId: artifact.originalAuthorId, visibility: artifact.visibility }).from(artifact).where(eq(artifact.id, id(key))))[0];
  const listedIn = async (scope: Parameters<typeof listArtifacts>[1]) => (await listArtifacts(leaver, scope)).map((item) => item.id);

  it("should list the leaver's artifacts whose home is the team, newest first, and name the longest-standing owner", async () => {
    const preview = await leavePreviewFor(crew, leaver);
    expect(preview.total).toBe(3);
    expect(preview.artifacts.map((item) => item.id)).toEqual([id("team-a"), id("team-b"), id("link-c")]);
    expect(preview.heir).toEqual({ name: "Ada Lovelace", username: `ada-${tag}` });
  });

  it("should count each member's artifacts in the team for the remove confirm", async () => {
    const facts = await removalFactsFor(crew, [{ memberId: "m-leaver", userId: leaver }, { memberId: "m-first", userId: firstOwner }]);
    expect(facts["m-leaver"]).toEqual({ artifacts: 3, heir: { name: "Ada Lovelace", username: `ada-${tag}` } });
    // Removing the first owner hands their artifacts to the next owner by length of stay.
    expect(facts["m-first"]).toMatchObject({ artifacts: 1, heir: { name: laterOwner } });
  });

  it("should move nothing that is not the leaver's own in this team", async () => {
    const result = await moveOwnTeamArtifactsToPersonal({ teamId: crew, userId: leaver, ids: [id("owners"), id("other-team"), id("private"), "not-an-artifact"] });
    expect(result.outcome).toEqual({ moved: [], waiting: [], refused: [] });
    expect(await ownerOf("owners")).toMatchObject({ userId: firstOwner, visibility: "team" });
    expect(await ownerOf("other-team")).toMatchObject({ visibility: "team" });
  });

  it("should move a chosen artifact to the leaver's Personal list and out of the team's", async () => {
    const result = await moveOwnTeamArtifactsToPersonal({ teamId: crew, userId: leaver, ids: [id("team-b")] });
    expect(result.outcome.moved.map((item) => item.id)).toEqual([id("team-b")]);
    expect(result.preview.total).toBe(2);
    expect(await ownerOf("team-b")).toMatchObject({ userId: leaver, visibility: "private" });
    expect(await listedIn({ scope: { kind: "personal" } })).toContain(id("team-b"));
    expect(await listedIn({ scope: { kind: "team", teamId: crew } })).not.toContain(id("team-b"));
  });

  it("should hand the rest to the person the preview named once the leaver is gone", async () => {
    await getDb().delete(teamMember).where(and(eq(teamMember.teamId, crew), eq(teamMember.userId, leaver)));
    expect(await reconcileTeamArtifacts(crew)).toBe(2);
    expect(await ownerOf("team-a")).toEqual({ userId: firstOwner, originalAuthorId: leaver, visibility: "team" });
    expect(await ownerOf("link-c")).toEqual({ userId: firstOwner, originalAuthorId: leaver, visibility: "link" });
    // What was moved first stays the leaver's, and so do the private one and the other team's.
    expect(await ownerOf("team-b")).toMatchObject({ userId: leaver, visibility: "private" });
    expect(await ownerOf("private")).toMatchObject({ userId: leaver });
    expect(await ownerOf("other-team")).toMatchObject({ userId: leaver });
  });

  it("should leave every one of these artifacts in some workspace", async () => {
    const unfindable = new Set((await listUnfindableArtifacts()).map((item) => item.id));
    for (const key of keys) expect(unfindable.has(id(key)), key).toBe(false);
  });
});
