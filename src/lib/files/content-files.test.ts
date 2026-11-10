import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { artifactFile } from "@/db/schema";

import { namedByAnyVersion } from "./content-files";

describe("namedByAnyVersion", () => {
  it("should compare each version of the same artifact with the file row being attached, never the version's own id", () => {
    const { sql: text, params } = new PgDialect().sqlToQuery(sql`update ${artifactFile} set named_in_content = ${namedByAnyVersion("a1")}`);
    const compact = text.replace(/\s+/g, " ");
    expect(params).toEqual(["a1", "ui", "markdown"]);
    expect(compact).toContain('from "artifact_version" v where v.artifact_id = $1 and v.kind in ($2, $3)');
    expect(compact).toContain('strpos(lower(v.content), "artifact_file"."id") > 0');
    const subquery = compact.slice(compact.indexOf("exists")).replaceAll('"artifact_file"."id"', "").replace(/\bv\.\w+/gu, "");
    expect(subquery).not.toMatch(/\b(id|artifact_id|content|kind)\b/u);
  });
});
