import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";

import { deletedOnRemovalQuery } from "./queries";

const db = drizzle({ client: neon("postgres://user:password@db.example.com/db") });

describe("deletedOnRemovalQuery", () => {
  it("should count artifacts that are private or not shared through the agent's team when removal would delete them", () => {
    const { sql, params } = deletedOnRemovalQuery(db, "team-1", ["agent-1", "agent-2"]).toSQL();
    expect(sql).toMatch(/"artifact"\."user_id" in \(\$\d+, \$\d+\)/);
    expect(sql).toMatch(/\("artifact"\."visibility" = \$\d+ or "artifact"\."team_id" is null or "artifact"\."team_id" <> \$\d+\)/);
    expect(sql).toContain('group by "artifact"."user_id"');
    expect(params).toEqual(["agent-1", "agent-2", "private", "team-1"]);
  });
});
