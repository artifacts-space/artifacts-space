import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";

import { teamWelcomeQuery } from "./welcome";

/*
 * The welcome card's read joins the membership, the team, and the member's
 * dismissal. These tests read the SQL itself, because stubbed rows cannot
 * catch an unqualified column that compares with itself (see AGENTS.md).
 */

const db = drizzle({ client: neon("postgres://user:password@db.example.com/db") });

describe("teamWelcomeQuery", () => {
  it("should tie the dismissal to the same member and team when it reads the card's facts", () => {
    const { sql } = teamWelcomeQuery(db, "member-1", "team-1").toSQL();
    expect(sql).toContain('"team_welcome_dismissal"."user_id" = "team_member"."user_id"');
    expect(sql).toContain('"team_welcome_dismissal"."team_id" = "team_member"."team_id"');
    expect(sql).toContain('"team"."id" = "team_member"."team_id"');
    expect(sql).not.toMatch(/"(user|team)_id" = "(user|team)_id"/);
  });

  it("should read only the signed-in member's row in the asked team when it filters", () => {
    const { sql, params } = teamWelcomeQuery(db, "member-1", "team-1").toSQL();
    expect(sql).toMatch(/where \("team_member"\."user_id" = \$\d+ and "team_member"\."team_id" = \$\d+\)/);
    expect(params).toEqual(expect.arrayContaining(["member-1", "team-1"]));
  });
});
