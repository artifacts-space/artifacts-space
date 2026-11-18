import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * The safety net from #219, against a real Postgres: no artifact may exist
 * that no signed-in person can find in a workspace. The check is first shown
 * to catch the rows it is for (a `team` artifact whose team is gone, an
 * agent's private artifact nobody acts for any more) and to pass the rows
 * that are fine, then run over the whole database, which must hold none.
 * Runs only when TEST_DATABASE_URL names a throwaway local database with the
 * migrations applied; never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

describe.runIf(Boolean(databaseUrl))("artifacts nobody can find, with a database", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { agent, artifact, team, teamMember, user } = await import("@/db/schema");
  const { listUnfindableArtifacts } = await import("./unfindable");

  const tag = randomUUID().slice(0, 8);
  const id = (name: string) => `lost-${tag}-${name}`;
  const author = id("author");
  const teammate = id("teammate");
  const ownedAgent = id("owned-agent");
  const orphanAgent = id("orphan-agent");
  const crew = id("crew");
  const left = id("left");
  const agentsOnly = id("agents-only");
  const users = [author, teammate, ownedAgent, orphanAgent];
  const fine = ["private", "team-crew", "team-left", "owned-agent-private", "orphan-agent-team"];
  const broken = ["team-no-team", "orphan-agent-private", "agents-only-team"];

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
    await db.insert(user).values(users.map((userId) => ({ id: userId, name: userId, email: `${userId}@example.com` })));
    await db.insert(team).values([
      { id: crew, name: "Crew", slug: crew, personal: false },
      { id: left, name: "Left", slug: left, personal: false },
      { id: agentsOnly, name: "Agents only", slug: agentsOnly, personal: false },
    ]);
    await db.insert(teamMember).values([
      { id: id("m-author"), teamId: crew, userId: author, role: "member" },
      { id: id("m-teammate"), teamId: crew, userId: teammate, role: "owner" },
      { id: id("m-teammate-left"), teamId: left, userId: teammate, role: "owner" },
      { id: id("m-owned-agent"), teamId: crew, userId: ownedAgent, role: "member" },
      { id: id("m-orphan-agent"), teamId: agentsOnly, userId: orphanAgent, role: "member" },
    ]);
    await db.insert(agent).values([
      { userId: ownedAgent, teamId: crew, ownerId: author },
      // The person who added it is gone: nobody acts for it, and its team has no person in it.
      { userId: orphanAgent, teamId: agentsOnly, ownerId: null },
    ]);
    await db.insert(artifact).values([
      row("private", { userId: author, visibility: "private" }),
      row("team-crew", { userId: author, visibility: "team", teamId: crew }),
      // Shared through a team its author left, not handed over yet: still in the author's Personal list.
      row("team-left", { userId: author, visibility: "team", teamId: left }),
      row("owned-agent-private", { userId: ownedAgent, visibility: "private" }),
      row("orphan-agent-team", { userId: orphanAgent, visibility: "team", teamId: crew }),
      // What a team deletion leaves today without the hand-back: team visibility, no team.
      row("team-no-team", { userId: author, visibility: "team" }),
      row("orphan-agent-private", { userId: orphanAgent, visibility: "private" }),
      row("agents-only-team", { userId: orphanAgent, visibility: "team", teamId: agentsOnly }),
    ]);
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(artifact).where(inArray(artifact.id, [...fine, ...broken].map(id)));
    await db.delete(team).where(inArray(team.id, [crew, left, agentsOnly]));
    await db.delete(user).where(inArray(user.id, users));
  });

  const seeded = async () => {
    const mine = new Set([...fine, ...broken].map(id));
    return (await listUnfindableArtifacts()).filter((item) => mine.has(item.id));
  };

  it("should list exactly the rows nobody can find, with the reason", async () => {
    expect(await seeded()).toEqual([
      { id: id("agents-only-team"), publicId: expect.any(String) as unknown, reason: "in_no_workspace" },
      { id: id("orphan-agent-private"), publicId: expect.any(String) as unknown, reason: "in_no_workspace" },
      { id: id("team-no-team"), publicId: expect.any(String) as unknown, reason: "team_without_team" },
    ]);
  });

  it("should pass a row again once someone can find it", async () => {
    await getDb().update(artifact).set({ visibility: "private" }).where(eq(artifact.id, id("team-no-team")));
    await getDb().update(agent).set({ ownerId: teammate, teamId: crew }).where(eq(agent.userId, orphanAgent));
    await getDb().insert(teamMember).values({ id: id("m-teammate-agents"), teamId: agentsOnly, userId: teammate, role: "owner" });
    expect(await seeded()).toEqual([]);
  });

  it("should find no such artifact anywhere in the database", async () => {
    await getDb().delete(artifact).where(inArray(artifact.id, broken.map(id)));
    expect(await listUnfindableArtifacts()).toEqual([]);
  });
});
