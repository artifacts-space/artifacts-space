import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";

import { feedQuery } from "./feed";

/* The bell must only ever list the signed-in person's own rows. Read the SQL itself: stubbed rows cannot catch a wrong filter. */

const db = drizzle({ client: neon("postgres://user:password@db.example.com/db") });

describe("feedQuery", () => {
  it("should filter by the recipient when it lists the bell", () => {
    const { sql, params } = feedQuery(db, "viewer-1", false, 50).toSQL();
    expect(sql).toContain('"notification"."recipient_id" = $');
    expect(params).toContain("viewer-1");
    expect(sql).not.toContain("read_at\" is null");
  });

  it("should keep only unread rows when counting", () => {
    const { sql } = feedQuery(db, "viewer-1", true, 50).toSQL();
    expect(sql).toContain('"notification"."read_at" is null');
  });

  it("should qualify every join column so no column compares with itself", () => {
    const { sql } = feedQuery(db, "viewer-1", false, 50).toSQL();
    expect(sql).toContain('"artifact"."id" = "notification"."artifact_id"');
    expect(sql).toContain('"sharing_request"."id" = "notification"."request_id"');
    expect(sql).toContain('"team"."id" = "sharing_request"."team_id"');
    expect(sql).not.toMatch(/"(\w+)" = "\1"/);
  });
});
