import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * The SQL capability check must agree with the rule the app uses
 * everywhere else: can() on the membership the loader builds. This runs
 * both against a real Postgres for every kind of role. It runs only when
 * TEST_DATABASE_URL names a throwaway local database with the migrations
 * applied (`pnpm db:migrate`); never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

describe.runIf(Boolean(databaseUrl))("capabilityHolderTeamQuery with a database", async () => {
  const { inArray } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { teamRole, teamRoleAssignment, teamRoleCapability } = await import("@/db/roles-schema");
  const { agent, team, teamMember, user } = await import("@/db/schema");
  const { capabilityHolderTeamQuery } = await import("./capability-sql");
  const { actingAs, can } = await import("./capability-rules");
  const { getTeamMembershipById } = await import("./queries");

  const tag = randomUUID().slice(0, 8);
  const id = (name: string) => `capsql-${tag}-${name}`;
  const shared = id("shared");
  const strict = id("strict");
  const personal = id("personal");

  // [person, team, stored role, custom role key or null, is an agent]
  const cases = [
    ["owner", shared, "owner", null, false],
    ["admin", shared, "admin", null, false],
    ["member", shared, "member", null, false],
    ["listed", shared, "member, owner", null, false],
    ["unknown", shared, "superuser", null, false],
    ["approver", shared, "member", "approver", false],
    ["viewer", shared, "member", "viewer", false],
    ["owner-custom", shared, "owner", "viewer", false],
    ["admin-strict", strict, "admin", null, false],
    ["member-strict", strict, "member", null, false],
    ["agent", shared, "admin", null, true],
    ["personal-owner", personal, "owner", null, false],
  ] as const;

  const people = cases.map(([name]) => id(name));

  beforeAll(async () => {
    const db = getDb();
    await db.insert(user).values(people.map((userId) => ({ id: userId, name: userId, email: `${userId}@example.com` })));
    await db.insert(team).values([
      { id: shared, name: "Shared", slug: shared, personal: false },
      { id: strict, name: "Strict", slug: strict, personal: false },
      { id: personal, name: "Personal", slug: personal, personal: true },
    ]);
    // Custom roles in the shared team, and a strict team whose admins lost approve sharing and whose members gained it.
    await db.insert(teamRole).values([
      { id: id("role-approver"), teamId: shared, key: "approver", name: "Approver" },
      { id: id("role-viewer"), teamId: shared, key: "viewer", name: "Viewer" },
      { id: id("role-admin"), teamId: strict, key: "admin", name: "Admin", builtIn: true },
      { id: id("role-member"), teamId: strict, key: "member", name: "Member", builtIn: true },
    ]);
    await db.insert(teamRoleCapability).values([
      { roleId: id("role-approver"), capability: "approve.sharing" },
      { roleId: id("role-viewer"), capability: "analytics.view" },
      { roleId: id("role-admin"), capability: "share.team" },
      { roleId: id("role-member"), capability: "approve.sharing" },
    ]);
    await db.insert(teamMember).values(cases.map(([name, teamId, role]) => ({ id: id(`m-${name}`), teamId, userId: id(name), role })));
    const assigned = cases.filter(([, , , custom]) => custom !== null);
    await db.insert(teamRoleAssignment).values(assigned.map(([name, , , custom]) => ({ memberId: id(`m-${name}`), roleId: id(`role-${String(custom)}`) })));
    await db.insert(agent).values(cases.filter(([, , , , isAgent]) => isAgent).map(([name, teamId]) => ({ userId: id(name), teamId })));
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(team).where(inArray(team.id, [shared, strict, personal]));
    await db.delete(user).where(inArray(user.id, people));
  });

  it.each(cases.map((row) => [row[0], row] as const))("should agree with can() for %s", async (_name, [name, teamId]) => {
    const membership = await getTeamMembershipById(id(name), teamId);
    const expected = Boolean(membership && !membership.personal && can(actingAs(membership, "person"), "approve.sharing") && membership.kind === "person");
    const rows = await capabilityHolderTeamQuery(getDb(), id(name), teamId, "approve.sharing");
    expect(rows.length > 0).toBe(expected);
  });

  it("should grant through each kind of role and refuse the rest", async () => {
    const granted: string[] = [];
    for (const [name, teamId] of cases) {
      const rows = await capabilityHolderTeamQuery(getDb(), id(name), teamId, "approve.sharing");
      if (rows.length > 0) granted.push(name);
    }
    expect(granted.sort()).toEqual(["admin", "approver", "listed", "member-strict", "owner"]);
  });

  it("should refuse a person in another team", async () => {
    await expect(capabilityHolderTeamQuery(getDb(), id("owner"), strict, "approve.sharing")).resolves.toEqual([]);
  });
});
