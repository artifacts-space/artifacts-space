import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";

import { artifact } from "@/db/schema";

import { csvDownloadWriteCondition } from "./write-condition";

/*
 * The write re-checks the permission in its own WHERE clause. These tests
 * read the update's SQL, because stubbed rows cannot show that the team,
 * the membership, and the role are part of it, or catch an unqualified
 * column (the AGENTS.md tripwire). store.db.test.ts runs it for real.
 */

const db = drizzle({ client: neon("postgres://user:password@db.example.com/db") });

function updateSql(record: { userId: string; teamId: string | null }, actorId = "lead-1") {
  return db.update(artifact).set({ allowCsvDownload: true }).where(csvDownloadWriteCondition(db, { actorId, artifactId: "art-1", record })).toSQL();
}

describe("csvDownloadWriteCondition", () => {
  it("should write only the same CSV artifact with the same author when it builds the update", () => {
    const { sql, params } = updateSql({ userId: "author-1", teamId: "team-1" });
    expect(sql).toMatch(/^update "artifact" set "allow_csv_download" = \$1 where/);
    expect(sql).toMatch(/"artifact"\."id" = \$\d+ and "artifact"\."kind" = \$\d+ and "artifact"\."user_id" = \$\d+/);
    expect(params).toEqual(expect.arrayContaining(["art-1", "csv", "author-1"]));
  });

  it("should require the team it checked, and the caller's approving role in it now, when it builds the update", () => {
    const { sql, params } = updateSql({ userId: "author-1", teamId: "team-1" });
    expect(sql).toMatch(/"artifact"\."team_id" in \(select "team"\."id" from "team_member" inner join "team" on "team"\."id" = "team_member"\."team_id"/);
    expect(sql).toMatch(/"team_member"\."user_id" = \$\d+ and "team_member"\."team_id" = \$\d+ and "team"\."personal" = \$\d+ and "agent"\."user_id" is null/);
    expect(params).toEqual(expect.arrayContaining(["lead-1", "team-1", "approve.sharing"]));
  });

  it("should let the author and the person acting for the writing agent through only as themselves when it builds the update", () => {
    const { sql } = updateSql({ userId: "author-1", teamId: "team-1" });
    expect(sql).toMatch(/\("artifact"\."user_id" = \$\d+ or "artifact"\."user_id" in \(select "agent"\."user_id" from "agent" inner join "team_member" on \("team_member"\."team_id" = "agent"\."team_id" and "team_member"\."user_id" = \$\d+\) where \("agent"\."owner_id" = \$\d+ and "agent"\."user_id" = \$\d+\)\)/);
  });

  it("should grant no team path when the artifact has no team", () => {
    const { sql } = updateSql({ userId: "author-1", teamId: null });
    expect(sql).not.toContain('"artifact"."team_id" in');
    expect(sql).not.toContain("held_capability");
  });

  it("should never leave a column unqualified or compare one with itself when it builds the update", () => {
    const { sql } = updateSql({ userId: "author-1", teamId: "team-1" });
    expect(sql.replace(/^update "artifact" set "allow_csv_download"/, "")).not.toMatch(/(?<![.\w"])"(id|user_id|team_id|owner_id|role_id|member_id|role|key|personal|kind|capability)"/);
    expect(sql).not.toMatch(/("\w+"\."\w+") = \1(?!\w)/);
  });
});
