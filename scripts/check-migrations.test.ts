import { describe, expect, it } from "vitest";

import { findViolations, hasAllowMarker, journalMismatches, splitStatements } from "./check-migrations.mjs";

describe("findViolations", () => {
  it("should reject a migration when it drops a column", () => {
    expect(findViolations('ALTER TABLE "artifact" DROP COLUMN "icon";')).toHaveLength(1);
  });

  it.each([
    ['DROP TABLE "artifact";', "DROP TABLE"],
    ['DROP TYPE "visibility";', "DROP TYPE"],
    ['TRUNCATE "artifact";', "TRUNCATE"],
    ['DELETE FROM "artifact";', "DELETE FROM without WHERE"],
    ['ALTER TABLE "artifact" ALTER COLUMN "bytes" SET DATA TYPE bigint;', "ALTER COLUMN ... TYPE"],
    ['ALTER TABLE "artifact" ALTER COLUMN "bytes" TYPE bigint;', "ALTER COLUMN ... TYPE"],
    ['ALTER TABLE "artifact" ALTER COLUMN "icon" SET NOT NULL;', "SET NOT NULL"],
    ['ALTER TABLE "artifact" RENAME COLUMN "icon" TO "emoji";', "RENAME COLUMN"],
    ['ALTER TABLE "artifact" RENAME TO "document";', "RENAME ... TO"],
    ['ALTER TABLE "artifact" ADD COLUMN "owner" text NOT NULL;', "ADD COLUMN ... NOT NULL without DEFAULT"],
  ])("should reject %s when it is not backward compatible", (sql, rule) => {
    expect(findViolations(sql).join("\n")).toContain(rule);
  });

  it.each([
    'ALTER TABLE "artifact" ADD COLUMN "icon" text;',
    'ALTER TABLE "artifact" ADD COLUMN "comments" text DEFAULT \'signed_in\' NOT NULL;',
    'ALTER TABLE "artifact" ALTER COLUMN "comments" SET DEFAULT \'team\';',
    'DELETE FROM "rate_limit" WHERE "expires_at" < now();',
    'DROP INDEX "sharing_request_pending_artifact_idx";',
    'CREATE TABLE "note" ("id" text PRIMARY KEY NOT NULL, "body" text NOT NULL);',
    'UPDATE "artifact" SET "visibility" = \'link\' WHERE "visibility" = \'unlisted\';',
  ])("should accept %s when it is additive", (sql) => {
    expect(findViolations(sql)).toEqual([]);
  });

  it("should reject a required column when another clause in the statement has the DEFAULT", () => {
    const sql = 'ALTER TABLE "a" ADD COLUMN "b" text NOT NULL, ALTER COLUMN "c" SET DEFAULT 1;';
    expect(findViolations(sql).join("\n")).toContain("without DEFAULT");
  });

  it("should accept rule words when they appear in comments, strings, or identifiers", () => {
    const sql = "-- DROP TABLE later\nINSERT INTO \"drop table\" (\"rename to\") VALUES ('TRUNCATE everything');";
    expect(findViolations(sql)).toEqual([]);
  });

  it("should accept a destructive file when its first line has the allow marker", () => {
    expect(findViolations('-- migration-guard: allow table was never used\nDROP TABLE "scratch";')).toEqual([]);
  });

  it("should reject a destructive file when the marker is not on the first line", () => {
    expect(findViolations('-- cleanup\n-- migration-guard: allow unused\nDROP TABLE "scratch";')).not.toEqual([]);
  });
});

describe("hasAllowMarker", () => {
  it("should not opt out when the marker gives no reason", () => {
    expect(hasAllowMarker("-- migration-guard: allow\nDROP TABLE x;")).toBe(false);
  });
});

describe("splitStatements", () => {
  it("should keep a function body in one statement when it uses dollar quotes", () => {
    const sql = "CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql;--> statement-breakpoint\nSELECT 1;";
    expect(splitStatements(sql)).toHaveLength(2);
  });
});

describe("journalMismatches", () => {
  it("should report a migration when it has no journal entry", () => {
    expect(journalMismatches(["0000_a", "0001_b"], ["0000_a"])).toEqual(["drizzle/0001_b.sql has no entry in drizzle/meta/_journal.json"]);
  });

  it("should report a journal entry when its file is missing", () => {
    expect(journalMismatches(["0000_a"], ["0000_a", "0001_b"])).toEqual(["the journal entry 0001_b has no drizzle/0001_b.sql"]);
  });

  it("should report nothing when files and journal match", () => {
    expect(journalMismatches(["0000_a"], ["0000_a"])).toEqual([]);
  });
});
