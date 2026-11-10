import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { artifactFile } from "@/db/schema";

import { namedAtAttach, namedBy } from "./content-files";

describe("namedAtAttach", () => {
  it("should compare each version of the same artifact with the file row being attached, never the version's own id", () => {
    const { sql: text, params } = new PgDialect().sqlToQuery(sql`update ${artifactFile} set named_in_content_at = ${namedAtAttach("a1")}`);
    const compact = text.replace(/\s+/g, " ");
    expect(params).toEqual(["a1", "ui", "markdown"]);
    expect(compact).toContain('from "artifact_version" v where v.artifact_id = $1 and v.kind in ($2, $3)');
    expect(compact).toContain('strpos(lower(v.content), "artifact_file"."id") > 0');
    const subquery = compact.slice(compact.indexOf("exists")).replaceAll('"artifact_file"."id"', "").replace(/\bv\.\w+/gu, "");
    expect(subquery).not.toMatch(/\b(id|artifact_id|content|kind)\b/u);
  });

  it("should stamp the attach time only when a version already names the file", () => {
    const { sql: text } = new PgDialect().sqlToQuery(sql`select ${namedAtAttach("a1")}`);
    expect(text.replace(/\s+/g, " ")).toMatch(/^select case when exists \(.*\) then now\(\) end$/u);
  });
});

describe("namedBy", () => {
  const servedAt = new Date("2026-11-10T12:00:00Z");

  it("should count a file as content for readers of a version saved after content named it", () => {
    expect(namedBy({ namedInContentAt: new Date("2026-11-10T11:00:00Z") }, servedAt)).toBe(true);
    expect(namedBy({ namedInContentAt: servedAt }, servedAt)).toBe(true);
  });

  it("should keep a plain attachment plain for readers of a version saved before a later draft embedded it", () => {
    expect(namedBy({ namedInContentAt: new Date("2026-11-10T13:00:00Z") }, servedAt)).toBe(false);
    expect(namedBy({ namedInContentAt: null }, servedAt)).toBe(false);
  });
});
