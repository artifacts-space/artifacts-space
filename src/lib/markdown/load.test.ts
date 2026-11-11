import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";

import { fakeDatabaseUrl } from "@/test/fake-database-url";

import { versionNumberQuery } from "./load";

const db = drizzle({ client: neon(fakeDatabaseUrl()) });

describe("versionNumberQuery", () => {
  it("should count only this artifact's versions saved up to the served one when a version id is given", () => {
    const { sql, params } = versionNumberQuery(db, "artifact-1", "version-1").toSQL();
    expect(sql).toContain("(select v.created_at from artifact_version v where v.id = $");
    expect(params).toEqual(["artifact-1", "version-1"]);
    expect(sql).not.toMatch(/"created_at" = "created_at"/);
  });

  it("should count every kept version when the reader gets the latest", () => {
    const { sql, params } = versionNumberQuery(db, "artifact-1", null).toSQL();
    expect(sql).not.toContain("select v.created_at");
    expect(params).toEqual(["artifact-1"]);
  });
});
