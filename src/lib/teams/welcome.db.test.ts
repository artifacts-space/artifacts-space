import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * The welcome card's storage against a real Postgres: it shows to a new
 * member, stays closed once they close it (in that team only), comes back
 * after they are removed and invited again, and refuses a team they are not
 * in. Each case makes its own team and people, so the cases run in any order.
 * Runs only when TEST_DATABASE_URL names a throwaway local database with the
 * migrations applied; never point it at a shared one.
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
  const made = { teams: [] as string[], users: [] as string[] };
  let counter = 0;
  const id = (name: string) => `welc-${tag}-${name}-${String((counter += 1))}`;

  async function newUser(name: string): Promise<string> {
    const userId = id(name);
    await getDb().insert(user).values({ id: userId, name: userId, email: `${userId}@example.com` });
    made.users.push(userId);
    return userId;
  }

  /** A shared team its owner created, with `members` in it as plain members. */
  async function newTeam(owner: string, members: readonly string[]): Promise<string> {
    const teamId = id("team");
    const db = getDb();
    await db.insert(team).values({ id: teamId, name: "Welcome team", slug: teamId, personal: false, createdBy: owner });
    made.teams.push(teamId);
    await db.insert(teamMember).values([
      { id: id("m"), teamId, userId: owner, role: "owner" },
      ...members.map((userId) => ({ id: id("m"), teamId, userId, role: "member" })),
    ]);
    return teamId;
  }

  /** An owner, a new member, and their team. */
  async function newMembership() {
    const owner = await newUser("owner");
    const member = await newUser("member");
    return { owner, member, teamId: await newTeam(owner, [member]) };
  }

  beforeAll(() => {
    counter = 0;
  });

  afterAll(async () => {
    const db = getDb();
    if (made.teams.length > 0) await db.delete(team).where(inArray(team.id, made.teams));
    if (made.users.length > 0) await db.delete(user).where(inArray(user.id, made.users));
  });

  it("should welcome a new member and not the person who created the team", async () => {
    const { owner, member, teamId } = await newMembership();
    expect(await shouldWelcome(member, teamId)).toBe(true);
    expect(await shouldWelcome(owner, teamId)).toBe(false);
  });

  it("should not welcome someone outside the team", async () => {
    const { teamId } = await newMembership();
    expect(await shouldWelcome(await newUser("outsider"), teamId)).toBe(false);
  });

  it("should refuse to save a dismissal when the person is not in the team", async () => {
    const { teamId } = await newMembership();
    const outsider = await newUser("outsider");
    expect(await dismissTeamWelcome(outsider, teamId)).toBe(false);
    const rows = await getDb().select().from(teamWelcomeDismissal).where(eq(teamWelcomeDismissal.userId, outsider));
    expect(rows).toHaveLength(0);
  });

  it("should keep the card closed in that team only when the member closes it, even twice", async () => {
    const { owner, member, teamId } = await newMembership();
    const otherTeam = await newTeam(owner, [member]);
    expect(await dismissTeamWelcome(member, teamId)).toBe(true);
    expect(await dismissTeamWelcome(member, teamId)).toBe(true);
    expect(await shouldWelcome(member, teamId)).toBe(false);
    expect(await shouldWelcome(member, otherTeam)).toBe(true);
  });

  it("should welcome a person again when they rejoin after closing the card, and keep the new close", async () => {
    const { member, teamId } = await newMembership();
    const db = getDb();
    expect(await dismissTeamWelcome(member, teamId)).toBe(true);
    // The close belongs to the first membership, an hour ago; the person was then removed and joined again a minute ago.
    await db.update(teamWelcomeDismissal).set({ createdAt: new Date(Date.now() - 3_600_000) }).where(and(eq(teamWelcomeDismissal.userId, member), eq(teamWelcomeDismissal.teamId, teamId)));
    await db.delete(teamMember).where(and(eq(teamMember.userId, member), eq(teamMember.teamId, teamId)));
    await db.insert(teamMember).values({ id: id("m-again"), teamId, userId: member, role: "member", createdAt: new Date(Date.now() - 60_000) });
    expect(await shouldWelcome(member, teamId)).toBe(true);
    expect(await dismissTeamWelcome(member, teamId)).toBe(true);
    expect(await shouldWelcome(member, teamId)).toBe(false);
  });
});
