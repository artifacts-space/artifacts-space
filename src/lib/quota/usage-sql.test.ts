import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";

import { fakeDatabaseUrl } from "@/test/fake-database-url";

import { accountOwnerQuery } from "./usage";

/* Reads the SQL itself: unqualified columns in joins once leaked team artifacts (see src/lib/access-subject.test.ts). */

const db = drizzle({ client: neon(fakeDatabaseUrl()) });

describe("accountOwnerQuery", () => {
  it("should resolve an agent to its owner through qualified joins", () => {
    const { sql } = accountOwnerQuery(db, "editor-1").toSQL();
    expect(sql).toContain('"account_owner"."id" = "agent"."owner_id"');
    expect(sql).toContain('coalesce("account_owner"."id", "user"."id")');
  });
});
