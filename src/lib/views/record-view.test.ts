import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { recordViewQuery } from "./record-view";
import { maxReferrerDomainsPerDay } from "./view-rules";

const dialect = new PgDialect();
const compile = (referrer: string | null) => dialect.sqlToQuery(recordViewQuery({ artifactId: "artifact-1", day: "2026-11-08", visitor: "a".repeat(32), referrer }));

describe("recordViewQuery", () => {
  it("should delete visitor hashes from earlier days when it records a view", () => {
    const { sql } = compile(null);
    expect(sql).toMatch(/delete from "artifact_view_visitor" where "artifact_view_visitor"\."day" < \$\d+::date/);
  });

  it("should count a visitor only when their hash is new today", () => {
    const { sql } = compile(null);
    expect(sql).toContain("on conflict do nothing");
    expect(sql).toContain("(select count(*) from seen)");
    expect(sql).toContain("visitors = \"artifact_view_day\".visitors + excluded.visitors");
  });

  it("should cap referrer domains per artifact and day when it stores one", () => {
    const { params } = compile("example.com");
    expect(params).toContain(maxReferrerDomainsPerDay);
    expect(params).toContain("example.com");
  });

  it("should send only the artifact, day, hash, and domain to the database", () => {
    const { params } = compile("example.com");
    expect(new Set(params)).toEqual(new Set(["artifact-1", "2026-11-08", "a".repeat(32), "example.com", maxReferrerDomainsPerDay]));
  });
});
