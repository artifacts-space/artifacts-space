import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";

import { fakeDatabaseUrl } from "@/test/fake-database-url";

import { teammatesQuery } from "./teammates";

/*
 * Who counts as the caller's teammate decides whose names an agent reads,
 * so this reads the SQL itself (AGENTS.md tripwire): both memberships are
 * aliases, every comparison names two different columns, and the caller and
 * the asked-about ids are both in the WHERE clause.
 */

const db = drizzle({ client: neon(fakeDatabaseUrl()) });
const selfCompare = /"(\w+)"\."(\w+)" = "\1"\."\2"/;

describe("teammatesQuery", () => {
  it("should join the caller's memberships to the same team's other members, in shared teams only, when it looks for teammates", () => {
    const { sql, params } = teammatesQuery(db, "caller-1", ["ada", "olga"]).toSQL();
    expect(sql).toContain('inner join "team" on ("team"."id" = "caller_member"."team_id" and "team"."personal" = $1)');
    expect(sql).toContain('inner join "team_member" "other_member" on "other_member"."team_id" = "caller_member"."team_id"');
    expect(sql).toMatch(/where \("caller_member"\."user_id" = \$2 and "other_member"\."user_id" in \(\$3, \$4\)\)/);
    expect(params).toEqual([false, "caller-1", "ada", "olga"]);
    expect(sql).not.toMatch(selfCompare);
    expect(sql).not.toMatch(/"team_id" = "team_id"/);
  });
});
