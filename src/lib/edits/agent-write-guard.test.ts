import { neon } from "@neondatabase/serverless";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";

import { artifact, artifactVersion } from "@/db/schema";

import { agentWriteCondition, liveLeaseCondition, onlyAgentsSavedSince } from "./agent-write-guard";
import { artifactStillAt, nextSaveTime } from "./save-time";

/*
 * The SQL every concurrent-edit guard adds to a save. Stubbed rows cannot
 * show a subquery that compares a column with itself (the tripwire in
 * AGENTS.md), so these tests read the generated SQL: every subquery is tied
 * to the artifact by a bound value or an alias, never a bare column.
 */

const db = drizzle({ client: neon("postgres://user:password@db.example.com/db") });
const artifactId = "artifact-1";
const base = new Date("2026-11-11T13:08:00.123Z");

function updateSql(condition: ReturnType<typeof onlyAgentsSavedSince> | undefined) {
  return db.update(artifact).set({ title: "x", updatedAt: nextSaveTime() }).where(and(eq(artifact.id, artifactId), condition)).toSQL();
}

describe("liveLeaseCondition", () => {
  it("should bind the artifact id as a value and read the lease by alias", () => {
    const { sql, params } = updateSql(liveLeaseCondition(artifactId));
    expect(sql).toMatch(/l\.artifact_id = \$\d+ and l\.expires_at > now\(\)/);
    expect(params).toContain(artifactId);
    expect(sql).not.toMatch(/"artifact_id" = "artifact_id"/);
  });
});

describe("agentWriteCondition", () => {
  it("should compare the row's save time with the base to the millisecond when the agent names a base", () => {
    const condition = agentWriteCondition(artifactId, { base: { versionId: "start", updatedAt: base }, guarded: true });
    const { sql, params } = updateSql(condition);
    expect(sql).toContain(`date_trunc('milliseconds', "artifact"."updated_at") = $`);
    expect(params).toContain(base.toISOString());
    expect(sql).not.toContain("artifact_edit_lease");
  });

  it("should add the lease guard only for a guarded save without a base", () => {
    expect(updateSql(agentWriteCondition(artifactId, { base: undefined, guarded: true })).sql).toMatch(/not exists \(select 1 from "artifact_edit_lease" l/);
    expect(agentWriteCondition(artifactId, { base: undefined, guarded: false })).toBeUndefined();
  });
});

describe("onlyAgentsSavedSince", () => {
  const { sql, params } = updateSql(onlyAgentsSavedSince(artifactId, base));

  it("should tie the version subquery to the artifact by a bound value, never column to column", () => {
    expect(sql).toMatch(/from "artifact_version" v where v\.artifact_id = \$\d+/);
    expect(params).toContain(artifactId);
    expect(sql).not.toMatch(/"artifact_id" = "artifact_id"/);
    expect(sql).not.toMatch(/"id" = "id"/);
  });

  it("should refuse a base later than the row's last save and any newer person save, recorded or versioned", () => {
    expect(sql).toContain(`date_trunc('milliseconds', "artifact"."updated_at") >= $`);
    expect(sql).toContain(`"artifact"."person_saved_at" is null or date_trunc('milliseconds', "artifact"."person_saved_at") <= $`);
    expect(sql).toContain(`coalesce("v".by_agent, "v".harness is not null) = false`);
    expect(params.filter((value) => value === base.toISOString())).toHaveLength(3);
  });
});

describe("artifactStillAt", () => {
  it("should read the artifact through its own alias with a bound id when used on another table", () => {
    const { sql, params } = db.update(artifactVersion).set({ title: "x" }).where(and(eq(artifactVersion.id, "v1"), artifactStillAt(artifactId, base))).toSQL();
    expect(sql).toMatch(/exists \(select 1 from "artifact" saved_row where saved_row\.id = \$\d+ and date_trunc\('milliseconds', saved_row\.updated_at\) = \$\d+::timestamptz\)/);
    expect(params).toEqual(expect.arrayContaining([artifactId, base.toISOString()]));
  });
});

describe("nextSaveTime", () => {
  it("should take the database clock, a millisecond past the row's last save at least, in whole milliseconds", () => {
    expect(updateSql(undefined).sql).toContain(`"updated_at" = date_trunc('milliseconds', greatest(now(), "artifact"."updated_at" + interval '1 millisecond'))`);
  });
});
