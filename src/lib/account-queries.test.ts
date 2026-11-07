import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";

import { unreadMentionSubjects } from "./comments/inbox";
import { accountCreatedAtQuery } from "./account-age";

/*
 * Access queries touched by the comments setting and the new-account rule.
 * They read the SQL itself: drizzle leaves column names unqualified in a
 * single-table select, which once turned a team check into "team_id" = "team_id".
 */

const db = drizzle({ client: neon("postgres://user:password@db.example.com/db") });

describe("unreadMentionSubjects", () => {
  it("should qualify every join and read the comments setting from the artifact", () => {
    const { sql, params } = unreadMentionSubjects(db, "viewer-1").toSQL();
    expect(sql).toContain('"comment"."id" = "mention"."comment_id"');
    expect(sql).toContain('"artifact"."id" = "mention"."artifact_id"');
    expect(sql).toContain('"artifact"."comments"');
    expect(sql).toContain('"mention"."recipient_id" = $');
    expect(params).toContain("viewer-1");
  });
});

describe("accountCreatedAtQuery", () => {
  it("should take an agent's age from its owner through qualified joins", () => {
    const { sql } = accountCreatedAtQuery(db, "author-1").toSQL();
    expect(sql).toContain('"agent"."user_id" = "user"."id"');
    expect(sql).toContain('"owner"."id" = "agent"."owner_id"');
    expect(sql).toContain('coalesce("owner"."created_at", "user"."created_at")');
    expect(sql).not.toMatch(/"id" = "id"|"created_at" = "created_at"/);
  });
});
