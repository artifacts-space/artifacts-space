import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as TeamQueries from "@/lib/teams/queries";

/*
 * setCsvDownload against a real Postgres, for what stubbed rows cannot
 * show: that the write itself re-checks the team, so a team admin who is
 * downgraded, or whose artifact leaves the team, after the permission
 * check and before the write changes nothing. It runs only when
 * TEST_DATABASE_URL names a throwaway local database with the migrations
 * applied (`pnpm db:migrate`); never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

// Runs between the permission check (its membership read) and the write.
const race = vi.hoisted(() => ({ afterCheck: null as (() => Promise<void>) | null }));

vi.mock("@/lib/teams/queries", async (importOriginal) => {
  const real = await importOriginal<typeof TeamQueries>();
  return {
    ...real,
    getTeamMembershipById: async (userId: string, teamId: string) => {
      const membership = await real.getTeamMembershipById(userId, teamId);
      await race.afterCheck?.();
      return membership;
    },
  };
});

const run = Boolean(databaseUrl);

describe.runIf(run)("setCsvDownload with a database", async () => {
  const { and, eq, inArray, like } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { teamRole, teamRoleCapability } = await import("@/db/roles-schema");
  const { artifact, rateLimitBucket, team, teamMember, user } = await import("@/db/schema");
  const { setCsvDownload } = await import("./store");

  const tag = randomUUID().slice(0, 8);
  const id = (name: string) => `csvdb-${tag}-${name}`;
  const ids = { author: id("author"), admin: id("admin"), stranger: id("stranger"), team: id("team"), other: id("other-team"), sheet: id("sheet") };
  const turnOn = (actorId: string) => setCsvDownload({ actorId, artifactId: ids.sheet, on: true, actor: "person" });
  const saved = async () => (await getDb().select({ on: artifact.allowCsvDownload, teamId: artifact.teamId }).from(artifact).where(eq(artifact.id, ids.sheet)))[0];

  async function cleanUp() {
    const db = getDb();
    await db.delete(artifact).where(eq(artifact.id, ids.sheet));
    await db.delete(rateLimitBucket).where(like(rateLimitBucket.key, `%csvdb-${tag}-%`));
    await db.delete(team).where(inArray(team.id, [ids.team, ids.other]));
    await db.delete(user).where(inArray(user.id, [ids.author, ids.admin, ids.stranger]));
  }

  beforeAll(async () => {
    const db = getDb();
    await db.insert(user).values([ids.author, ids.admin, ids.stranger].map((userId) => ({ id: userId, name: userId, email: `${userId}@example.com` })));
    await db.insert(team).values([
      { id: ids.team, name: "CSV team", slug: ids.team, personal: false },
      { id: ids.other, name: "Other team", slug: ids.other, personal: false },
    ]);
  });

  beforeEach(async () => {
    race.afterCheck = null;
    const db = getDb();
    await db.delete(artifact).where(eq(artifact.id, ids.sheet));
    await db.delete(teamMember).where(inArray(teamMember.teamId, [ids.team, ids.other]));
    await db.delete(teamRole).where(inArray(teamRole.teamId, [ids.team, ids.other]));
    await db.insert(teamMember).values([
      { id: id("m-author"), teamId: ids.team, userId: ids.author, role: "member" },
      { id: id("m-admin"), teamId: ids.team, userId: ids.admin, role: "admin" },
      { id: id("m-admin-other"), teamId: ids.other, userId: ids.admin, role: "admin" },
    ]);
    await db.insert(artifact).values({ id: ids.sheet, userId: ids.author, teamId: ids.team, title: "Sheet", content: "a,b\n1,2", kind: "csv", visibility: "team", shareId: id("share") });
  });

  afterAll(async () => {
    await cleanUp();
  });

  it("should save the setting when a team admin asks and nothing changes meanwhile", async () => {
    await expect(turnOn(ids.admin)).resolves.toMatchObject({ allowCsvDownload: true });
    expect(await saved()).toMatchObject({ on: true });
  });

  it("should refuse a team admin and write nothing when their role drops to member after the check", async () => {
    race.afterCheck = async () => {
      await getDb().update(teamMember).set({ role: "member" }).where(and(eq(teamMember.teamId, ids.team), eq(teamMember.userId, ids.admin)));
    };
    await expect(turnOn(ids.admin)).rejects.toThrow("Artifact not found");
    expect(await saved()).toMatchObject({ on: false });
  });

  it("should refuse a team admin and write nothing when the admin role loses approve sharing after the check", async () => {
    race.afterCheck = async () => {
      const [role] = await getDb().insert(teamRole).values({ id: id("role-admin"), teamId: ids.team, key: "admin", name: "Admin", builtIn: true }).returning();
      if (!role) throw new Error("The admin role was not created.");
      await getDb().insert(teamRoleCapability).values({ roleId: role.id, capability: "share.team" });
    };
    await expect(turnOn(ids.admin)).rejects.toThrow("Artifact not found");
    expect(await saved()).toMatchObject({ on: false });
  });

  it("should refuse a team admin and write nothing when the artifact moves to another team after the check, even one they also run", async () => {
    race.afterCheck = async () => {
      await getDb().update(artifact).set({ teamId: ids.other }).where(eq(artifact.id, ids.sheet));
    };
    await expect(turnOn(ids.admin)).rejects.toThrow("Artifact not found");
    expect(await saved()).toMatchObject({ on: false, teamId: ids.other });
  });

  it("should refuse a team admin and write nothing when they leave the team after the check", async () => {
    race.afterCheck = async () => {
      await getDb().delete(teamMember).where(and(eq(teamMember.teamId, ids.team), eq(teamMember.userId, ids.admin)));
    };
    await expect(turnOn(ids.admin)).rejects.toThrow("Artifact not found");
    expect(await saved()).toMatchObject({ on: false });
  });

  it("should save the setting when the author asks", async () => {
    await expect(turnOn(ids.author)).resolves.toMatchObject({ allowCsvDownload: true });
    expect(await saved()).toMatchObject({ on: true });
  });

  it("should count a refused stranger against the rate limit and write nothing", async () => {
    await expect(turnOn(ids.stranger)).rejects.toThrow("Artifact not found");
    const buckets = await getDb().select({ count: rateLimitBucket.count }).from(rateLimitBucket).where(eq(rateLimitBucket.key, `artifactUpdate:${ids.stranger}`));
    expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBeGreaterThan(0);
    expect(await saved()).toMatchObject({ on: false });
  });
});
