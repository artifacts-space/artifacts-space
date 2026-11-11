import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * The welcome card's storage against a real Postgres: it shows to a new
 * member, stays closed once they close it (in that team only), and refuses a
 * team they are not in. Runs only when TEST_DATABASE_URL names a throwaway
 * local database with the migrations applied; never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

describe.runIf(Boolean(databaseUrl))("team welcome with a database", async () => {
  const { and, eq, inArray } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { team, teamMember, user } = await import("@/db/schema");
  const { teamWelcomeDismissal } = await import("@/db/team-welcome-schema");
  const { dismissTeamWelcome, shouldWelcome } = await import("./welcome");

  const tag = randomUUID().slice(0, 8);
  const id = (name: string) => `welc-${tag}-${name}`;
  const owner = id("owner");
  const member = id("member");
  const outsider = id("outsider");
  const teamId = id("team");
  const otherTeam = id("other");

  beforeAll(async () => {
    const db = getDb();
    await db.insert(user).values([owner, member, outsider].map((userId) => ({ id: userId, name: userId, email: `${userId}@example.com` })));
    await db.insert(team).values([
      { id: teamId, name: "Welcome team", slug: teamId, personal: false, createdBy: owner },
      { id: otherTeam, name: "Other team", slug: otherTeam, personal: false, createdBy: owner },
    ]);
    await db.insert(teamMember).values([
      { id: id("m-owner"), teamId, userId: owner, role: "owner" },
      { id: id("m-member"), teamId, userId: member, role: "member" },
      { id: id("m-other"), teamId: otherTeam, userId: member, role: "member" },
    ]);
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(team).where(inArray(team.id, [teamId, otherTeam]));
    await db.delete(user).where(inArray(user.id, [owner, member, outsider]));
  });

  it("should welcome a new member and not the person who created the team", async () => {
    expect(await shouldWelcome(member, teamId)).toBe(true);
    expect(await shouldWelcome(owner, teamId)).toBe(false);
  });

  it("should not welcome someone outside the team", async () => {
    expect(await shouldWelcome(outsider, teamId)).toBe(false);
  });

  it("should refuse to save a dismissal when the person is not in the team", async () => {
    expect(await dismissTeamWelcome(outsider, teamId)).toBe(false);
    const rows = await getDb().select().from(teamWelcomeDismissal).where(inArray(teamWelcomeDismissal.userId, [outsider]));
    expect(rows).toHaveLength(0);
  });

  it("should keep the card closed in that team only when the member closes it, even twice", async () => {
    expect(await dismissTeamWelcome(member, teamId)).toBe(true);
    expect(await dismissTeamWelcome(member, teamId)).toBe(true);
    expect(await shouldWelcome(member, teamId)).toBe(false);
    expect(await shouldWelcome(member, otherTeam)).toBe(true);
  });

  it("should welcome a person again when they rejoin after closing the card, and keep the new close", async () => {
    const db = getDb();
    const hourAgo = new Date(Date.now() - 3_600_000);
    // The close belongs to the first membership, an hour ago; the person was then removed and joined again a minute ago.
    await db.update(teamWelcomeDismissal).set({ createdAt: hourAgo }).where(and(eq(teamWelcomeDismissal.userId, member), eq(teamWelcomeDismissal.teamId, teamId)));
    await db.delete(teamMember).where(eq(teamMember.id, id("m-member")));
    await db.insert(teamMember).values({ id: id("m-member-again"), teamId, userId: member, role: "member", createdAt: new Date(Date.now() - 60_000) });
    expect(await shouldWelcome(member, teamId)).toBe(true);
    expect(await dismissTeamWelcome(member, teamId)).toBe(true);
    expect(await shouldWelcome(member, teamId)).toBe(false);
  });
});
