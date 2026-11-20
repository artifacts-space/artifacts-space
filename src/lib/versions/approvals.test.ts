import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";

import { fakeDatabaseUrl } from "@/test/fake-database-url";

import { previousVersionQuery, versionApprovalsQuery } from "./approvals";

/*
 * Both queries read one artifact's history for an editor, so these read the
 * SQL (AGENTS.md tripwire): the artifact is always in the WHERE clause, and
 * the self-join compares two aliases, never a column with itself.
 */

const db = drizzle({ client: neon(fakeDatabaseUrl()) });

describe("versionApprovalsQuery", () => {
  it("should read only approved edit requests of this artifact that name these versions", () => {
    const { sql, params } = versionApprovalsQuery(db, "artifact-1", ["v1", "v2"]).toSQL();
    expect(sql).toMatch(/"sharing_request"\."artifact_id" = \$1/);
    expect(sql).toMatch(/"sharing_request"\."kind" = \$2/);
    expect(sql).toMatch(/"sharing_request"\."status" = \$3/);
    expect(sql).toMatch(/"sharing_request"\."version_id" in \(\$4, \$5\)/);
    expect(params).toEqual(["artifact-1", "edit", "approved", "v1", "v2"]);
  });
});

describe("previousVersionQuery", () => {
  it("should join two aliases of the history within the one artifact, never a column with itself", () => {
    const { sql, params } = previousVersionQuery(db, "artifact-1", "v2").toSQL();
    expect(sql).toContain('"earlier_version"."artifact_id" = "current_version"."artifact_id"');
    expect(sql).toContain('"earlier_version"."created_at" < "current_version"."created_at"');
    expect(sql).toMatch(/"current_version"\."id" = \$\d+ and "current_version"\."artifact_id" = \$\d+/);
    expect(params).toEqual(expect.arrayContaining(["v2", "artifact-1"]));
    expect(sql).not.toMatch(/"(\w+)"\."(\w+)" = "\1"\."\2"/);
  });
});
