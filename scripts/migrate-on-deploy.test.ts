import { describe, expect, it } from "vitest";

import { describeError, pendingTags, planMigration, redact, secretsFrom } from "./migrate-on-deploy.mjs";

const url = "postgresql://neondb_owner:s3cret-pass@ep-quiet-sky-123456.us-east-2.aws.neon.tech/neondb?sslmode=require";

describe("planMigration", () => {
  it("should skip when the build is a preview deploy", () => {
    const plan = planMigration({ VERCEL: "1", VERCEL_ENV: "preview", DATABASE_URL_UNPOOLED: url });
    expect(plan).toEqual({ kind: "skip", message: "Skipping migrations: not a production deploy." });
  });

  it("should skip when the build runs outside Vercel", () => {
    expect(planMigration({ DATABASE_URL_UNPOOLED: url }).kind).toBe("skip");
  });

  it("should skip when VERCEL_ENV is production but the build is not on Vercel", () => {
    expect(planMigration({ VERCEL_ENV: "production", DATABASE_URL_UNPOOLED: url }).kind).toBe("skip");
  });

  it("should fail when a production deploy has no unpooled database URL", () => {
    const plan = planMigration({ VERCEL: "1", VERCEL_ENV: "production", DATABASE_URL: url });
    expect(plan.kind).toBe("fail");
  });

  it("should fail when the unpooled database URL is blank", () => {
    expect(planMigration({ VERCEL: "1", VERCEL_ENV: "production", DATABASE_URL_UNPOOLED: "  " }).kind).toBe("fail");
  });

  it("should migrate over the unpooled URL when the build is a production deploy", () => {
    const plan = planMigration({ VERCEL: "1", VERCEL_ENV: "production", DATABASE_URL_UNPOOLED: url, DATABASE_URL: "pooled" });
    expect(plan).toEqual({ kind: "migrate", databaseUrl: url });
  });
});

describe("redact", () => {
  it("should remove a connection string when it appears in an error", () => {
    const safe = redact(`connect failed for ${url} after 30s`, []);
    expect(safe).toBe("connect failed for [redacted connection string] after 30s");
  });

  it("should remove the password, user, and host when they appear without the URL", () => {
    const secrets = secretsFrom({ DATABASE_URL_UNPOOLED: url });
    const safe = redact("password authentication failed for user neondb_owner (s3cret-pass) at ep-quiet-sky-123456.us-east-2.aws.neon.tech", secrets);
    expect(safe).not.toContain("s3cret-pass");
    expect(safe).not.toContain("neondb_owner");
    expect(safe).not.toContain("ep-quiet-sky-123456");
  });

  it("should leave text alone when it holds no secrets", () => {
    expect(redact("relation \"artifact\" does not exist", secretsFrom({ DATABASE_URL_UNPOOLED: url }))).toBe('relation "artifact" does not exist');
  });
});

describe("secretsFrom", () => {
  it("should ignore env values when their names are not database settings", () => {
    expect(secretsFrom({ VERCEL_ENV: "production", NODE_ENV: "production" })).toEqual([]);
  });
});

describe("pendingTags", () => {
  const entries = [
    { tag: "0000_first", when: 100 },
    { tag: "0001_second", when: 200 },
  ];

  it("should list every migration when the database has none applied", () => {
    expect(pendingTags(entries, null)).toEqual(["0000_first", "0001_second"]);
  });

  it("should list nothing when the newest migration is already applied", () => {
    expect(pendingTags(entries, 200)).toEqual([]);
  });

  it("should list only newer migrations when some are applied", () => {
    expect(pendingTags(entries, 100)).toEqual(["0001_second"]);
  });
});

describe("describeError", () => {
  it("should include the cause when a query error wraps one", () => {
    const error = new Error("Failed query: create table", { cause: new Error('relation "x" already exists') });
    expect(describeError(error)).toBe('Failed query: create table Caused by: relation "x" already exists');
  });
});
