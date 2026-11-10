import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { artifactFile } from "@/db/schema";

vi.mock("@/db", () => ({ getDb: () => null }));

const { notNamedByArtifact } = await import("./icon-cleanup");

describe("notNamedByArtifact", () => {
  it("should check the artifact's current content and every version against the file row, never the subquery's own id", () => {
    const { sql: text, params } = new PgDialect().sqlToQuery(sql`update ${artifactFile} set artifact_id = null where ${notNamedByArtifact("a1")}`);
    const compact = text.replace(/\s+/g, " ");
    expect(params).toEqual(["a1", "a1"]);
    expect(compact).toContain('from "artifact" a where a.id = $1 and strpos(lower(a.content), "artifact_file"."id") > 0');
    expect(compact).toContain('from "artifact_version" v where v.artifact_id = $2 and strpos(lower(v.content), "artifact_file"."id") > 0');
    const subqueries = compact.slice(compact.indexOf("not exists")).replaceAll('"artifact_file"."id"', "").replace(/\b[av]\.\w+/gu, "");
    expect(subqueries).not.toMatch(/\b(id|artifact_id|content)\b/u);
  });
});
