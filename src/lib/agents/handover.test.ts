import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { tokenLookupQuery } from "@/lib/tokens";

/*
 * A departed member's agent must stop reading the team's work at once. These
 * tests check the three pieces that guarantee it: the handover picks the
 * agent, its tokens are revoked, and a revoked token never authenticates.
 */

const mocks = vi.hoisted(() => ({ selects: [] as unknown[][], updates: [] as { table: unknown; values: unknown }[], deletes: [] as unknown[] }));

vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => Promise.resolve(mocks.selects.shift() ?? []) }) }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: () => {
          mocks.updates.push({ table, values });
          return Promise.resolve();
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: () => {
        mocks.deletes.push(table);
        return Promise.resolve();
      },
    }),
  }),
}));

const { handOverAgentsQuery, reconcileTeamAgents, revokeAgentTokensQuery } = await import("./handover");
const { agent, apiToken } = await import("@/db/schema");

const sqlDb = drizzle({ client: neon("postgres://user:password@db.example.com/db") });
const now = new Date("2026-11-08T12:00:00Z");
const joined = (day: number) => new Date(Date.UTC(2026, 0, day));

function members(...rows: [string, string, number][]) {
  return rows.map(([userId, role, day]) => ({ userId, role, createdAt: joined(day) }));
}

describe("reconcileTeamAgents", () => {
  beforeEach(() => {
    mocks.selects = [];
    mocks.updates = [];
    mocks.deletes = [];
  });

  it("should revoke the tokens of a departed member's agent and hand it to the longest-standing owner", async () => {
    mocks.selects = [
      members(["owner-1", "owner", 1], ["owner-2", "owner", 5], ["stayer", "member", 2], ["agent-of-stayer", "member", 3], ["agent-of-leaver", "member", 4]),
      [
        { userId: "agent-of-leaver", ownerId: "leaver", handedOverAt: null },
        { userId: "agent-of-stayer", ownerId: "stayer", handedOverAt: null },
      ],
    ];
    await expect(reconcileTeamAgents("team-1", now)).resolves.toBe(1);
    const tokenRevoke = mocks.updates.find((update) => update.table === apiToken);
    expect(tokenRevoke?.values).toEqual({ revokedAt: now });
    const handover = mocks.updates.find((update) => update.table === agent);
    expect(handover?.values).toEqual({ ownerId: "owner-1", handedOverAt: now });
    expect(mocks.deletes).toHaveLength(3);
  });

  it("should touch nothing when every agent's owner is still in the team", async () => {
    mocks.selects = [members(["owner-1", "owner", 1], ["agent-1", "member", 2]), [{ userId: "agent-1", ownerId: "owner-1", handedOverAt: null }]];
    await expect(reconcileTeamAgents("team-1", now)).resolves.toBe(0);
    expect(mocks.updates).toHaveLength(0);
  });
});

describe("handover SQL", () => {
  it("should revoke only the active tokens of the handed-over agents when tokens are revoked", () => {
    const { sql, params } = revokeAgentTokensQuery(sqlDb, ["agent-of-leaver"], now).toSQL();
    expect(sql).toBe('update "api_token" set "revoked_at" = $1 where ("api_token"."user_id" in ($2) and "api_token"."revoked_at" is null)');
    expect(params).toEqual([now.toISOString(), "agent-of-leaver"]);
  });

  it("should give only the handed-over agents the new owner when they move", () => {
    const { sql, params } = handOverAgentsQuery(sqlDb, ["agent-of-leaver"], "owner-1", now).toSQL();
    expect(sql).toMatch(/^update "agent" set "owner_id" = \$1, "handed_over_at" = \$2 where "agent"\."user_id" in \(\$3\)$/);
    expect(params).toEqual(["owner-1", now.toISOString(), "agent-of-leaver"]);
  });

  it("should never authenticate a revoked token when an agent's token is presented after a handover", () => {
    const { sql } = tokenLookupQuery(sqlDb, "hash").toSQL();
    expect(sql).toContain('"api_token"."revoked_at" is null');
    expect(sql).toContain('"api_token"."token_hash" = $1');
  });
});
