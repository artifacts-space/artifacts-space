import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";

import { createdByRequestQuery } from "./created-by-request";

/*
 * A retried create hands back the artifact its create id stored. The lookup
 * must stay scoped to the user who sends it, or one person's create id
 * could hand them someone else's artifact. Read from the SQL itself, since
 * stubbed rows cannot show a missing condition.
 */

const db = drizzle({ client: neon("postgres://user:password@db.example.com/db") });
const requestId = "0b6f6d43-8a8f-4b52-9f44-2f8c1a6d3e10";

describe("createdByRequestQuery", () => {
  it("should match the create id only among the sender's own artifacts", () => {
    const { sql, params } = createdByRequestQuery(db, "user-1", requestId).toSQL();
    expect(sql).toMatch(/where \("artifact"\."user_id" = \$\d+ and "artifact"\."create_request_id" = \$\d+\)/);
    expect(params).toEqual(["user-1", requestId, 1]);
  });

  it("should never read the agent's session id", () => {
    const { sql } = createdByRequestQuery(db, "user-1", requestId).toSQL();
    expect(sql).not.toContain("session_id");
  });
});
