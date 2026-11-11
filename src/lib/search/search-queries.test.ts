import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";

import { fakeDatabaseUrl } from "@/test/fake-database-url";

import { sitemapCandidatesQuery } from "./search-queries";

/*
 * The sitemap query reads the SQL itself: drizzle leaves column names
 * unqualified in a single-table select, which once turned a team check into
 * "team_id" = "team_id". A loose filter here would list private artifacts.
 */

const db = drizzle({ client: neon(fakeDatabaseUrl()) });

describe("sitemapCandidatesQuery", () => {
  it("should filter on the setting, public visibility, and account age when the sitemap is built", () => {
    const { sql, params } = sitemapCandidatesQuery(db).toSQL();
    expect(sql).toContain('"artifact"."show_in_search" = $');
    expect(sql).toContain('"artifact"."visibility" = $');
    expect(params).toContain(true);
    expect(params).toContain("public");
    expect(sql).toMatch(/coalesce\("owner"\."created_at", "user"\."created_at"\) <= now\(\) - make_interval\(days => \$\d+\)/);
  });

  it("should qualify every join when an agent's age comes from its owner", () => {
    const { sql } = sitemapCandidatesQuery(db).toSQL();
    expect(sql).toContain('"user"."id" = "artifact"."user_id"');
    expect(sql).toContain('"agent"."user_id" = "user"."id"');
    expect(sql).toContain('"owner"."id" = "agent"."owner_id"');
    expect(sql).not.toMatch(/"id" = "id"|"user_id" = "user_id"|"created_at" = "created_at"/);
  });

  it("should never select content or private fields when the sitemap is built", () => {
    const { sql } = sitemapCandidatesQuery(db).toSQL();
    const selected = sql.slice(0, sql.indexOf(" from "));
    expect(selected).not.toContain('"content"');
    expect(selected).not.toContain('"title"');
    expect(selected).not.toContain('"email"');
  });

  it("should cap the list when a limit is given", () => {
    const { params } = sitemapCandidatesQuery(db, 10).toSQL();
    expect(params).toContain(10);
  });
});
