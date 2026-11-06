import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";

import { subjectQuery } from "./access";

/*
 * The access decision once matched every signed-in user to every team:
 * drizzle printed `team_member.team_id = artifact.team_id` inside a
 * single-table select as `"team_id" = "team_id"`. These tests read the SQL
 * itself, because stubbed rows cannot catch that.
 */

const db = drizzle({ client: neon("postgres://user:password@db.example.com/db") });

describe("subjectQuery", () => {
  it("should tie the viewer's membership to the artifact's own team when a viewer is signed in", () => {
    const { sql, params } = subjectQuery(db, "4fXkP9qR2sT7vW1yZ3aB5c", "viewer-1").toSQL();
    expect(sql).toContain('"team_member"."team_id" = "artifact"."team_id"');
    expect(sql).toContain('"team_member"."user_id" = $');
    expect(params).toContain("viewer-1");
  });

  it("should match no membership row when the viewer is anonymous", () => {
    const { sql } = subjectQuery(db, "4fXkP9qR2sT7vW1yZ3aB5c", null).toSQL();
    expect(sql).toMatch(/left join "team_member" on false/);
  });

  it("should qualify every column when it reads the team and the approved version", () => {
    const { sql } = subjectQuery(db, "4fXkP9qR2sT7vW1yZ3aB5c", "viewer-1").toSQL();
    expect(sql).toContain('"team"."id" = "artifact"."team_id"');
    expect(sql).toContain('"artifact_version"."id" = "artifact"."approved_version_id"');
    expect(sql).not.toMatch(/"team_id" = "team_id"/);
  });
});
