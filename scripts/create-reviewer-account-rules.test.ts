import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { fakeDatabaseUrl, fakeNeonHost } from "@/test/fake-database-url";

import {
  ALLOW_SHARED_REVIEWER_ACCOUNT,
  isStrongEnough,
  MIN_PASSWORD_LENGTH,
  PASSWORD_BYTES,
  parseReviewerArgs,
  reviewerDatabase,
  reviewerEmailProblem,
  sampleArtifacts,
} from "./create-reviewer-account-rules.mts";

const local = fakeDatabaseUrl({ user: "ci", password: "ci", host: "127.0.0.1", port: 55473, database: "artifacts_test" });
const shared = fakeDatabaseUrl({ user: "owner", password: "fake-secret", host: fakeNeonHost("ep-example"), database: "neondb" });

const base = ["--email", "Reviewer@Artifacts.Space", "--name", "Directory reviewer", "--username", "Reviewer-One"];

describe("parseReviewerArgs", () => {
  it("should read the email, name, and username, lowercased where they are identifiers", () => {
    expect(parseReviewerArgs(base)).toEqual({ ok: true, request: { email: "reviewer@artifacts.space", name: "Directory reviewer", username: "reviewer-one", resetPassword: false } });
  });

  it("should reset only when asked with --reset-password", () => {
    const parsed = parseReviewerArgs([...base, "--reset-password"]);
    expect(parsed.ok && parsed.request.resetPassword).toBe(true);
  });

  it("should refuse an address that is not an email", () => {
    expect(parseReviewerArgs(["--email", "reviewer", "--name", "R", "--username", "reviewer"]).ok).toBe(false);
  });

  it("should refuse a reserved or malformed username", () => {
    expect(parseReviewerArgs(["--email", "r@example.com", "--name", "R", "--username", "admin"]).ok).toBe(false);
    expect(parseReviewerArgs(["--email", "r@example.com", "--name", "R", "--username", "-bad-"]).ok).toBe(false);
  });

  it("should refuse a missing name, an unknown flag, and a stray argument", () => {
    expect(parseReviewerArgs(["--email", "r@example.com", "--username", "reviewer"]).ok).toBe(false);
    expect(parseReviewerArgs([...base, "--password", "chosen"]).ok).toBe(false);
    expect(parseReviewerArgs([...base, "extra"]).ok).toBe(false);
  });
});

describe("reviewerEmailProblem", () => {
  const localRun = { ok: true as const, url: local, allowTestDomain: true };
  const sharedRun = { ok: true as const, url: shared, allowTestDomain: false };

  it.each([
    ["an outside domain", "reviewer@gmail.com"],
    ["a look-alike domain", "reviewer@artifacts.space.evil.example"],
    ["a subdomain", "reviewer@mail.artifacts.space"],
  ])("should refuse %s", (_label, email) => {
    expect(reviewerEmailProblem(email, localRun)).not.toBeNull();
  });

  it("should accept the site's own domain on any database", () => {
    expect(reviewerEmailProblem("reviewer@artifacts.space", sharedRun)).toBeNull();
    expect(reviewerEmailProblem("reviewer@artifacts.space", localRun)).toBeNull();
  });

  it("should accept @example.com only for a database on this machine", () => {
    expect(reviewerEmailProblem("reviewer@example.com", localRun)).toBeNull();
    expect(reviewerEmailProblem("reviewer@example.com", sharedRun)).not.toBeNull();
  });
});

describe("reviewerDatabase", () => {
  it("should use a database on this machine and allow the test domain there", () => {
    expect(reviewerDatabase({ DATABASE_URL: local })).toEqual({ ok: true, url: local, allowTestDomain: true });
  });

  it("should prefer the direct connection when both are set", () => {
    expect(reviewerDatabase({ DATABASE_URL: shared, DATABASE_URL_UNPOOLED: local })).toMatchObject({ ok: true, url: local });
  });

  it("should stop before it connects to a shared database without the flag, and never show the URL", () => {
    const result = reviewerDatabase({ DATABASE_URL: shared });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("fake-secret");
    expect(JSON.stringify(result)).not.toContain("ep-example");
    expect(reviewerDatabase({ DATABASE_URL: shared, ALLOW_SHARED_MIGRATE: "1" }).ok).toBe(false);
    expect(reviewerDatabase({ DATABASE_URL: shared, [ALLOW_SHARED_REVIEWER_ACCOUNT]: "true" }).ok).toBe(false);
  });

  it("should stop when a local-looking URL sends pg to another host", () => {
    expect(reviewerDatabase({ DATABASE_URL: `${local}?host=${fakeNeonHost("ep-example")}` }).ok).toBe(false);
  });

  it("should reach a shared database only when the flag is set to 1, and never allow the test domain there", () => {
    expect(reviewerDatabase({ DATABASE_URL: shared, [ALLOW_SHARED_REVIEWER_ACCOUNT]: "1" })).toEqual({ ok: true, url: shared, allowTestDomain: false });
  });

  it("should not allow the test domain with the shared flag set, even on this machine", () => {
    expect(reviewerDatabase({ DATABASE_URL: local, [ALLOW_SHARED_REVIEWER_ACCOUNT]: "1" })).toMatchObject({ ok: true, allowTestDomain: false });
  });

  it("should stop when no database is set", () => {
    expect(reviewerDatabase({}).ok).toBe(false);
    expect(reviewerDatabase({ DATABASE_URL: "  " }).ok).toBe(false);
  });
});

describe("passwords", () => {
  it("should generate passwords of at least 24 characters from the random bytes", () => {
    const password = randomBytes(PASSWORD_BYTES).toString("base64url");
    expect(password.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    expect(isStrongEnough(password)).toBe(true);
  });

  it("should refuse to print a short password", () => {
    expect(isStrongEnough("short")).toBe(false);
  });
});

describe("sampleArtifacts", () => {
  it("should seed a plan, a short doc, and a table", () => {
    expect(sampleArtifacts.map((sample) => sample.kind)).toEqual(["markdown", "markdown", "csv"]);
    for (const sample of sampleArtifacts) expect(sample.content.trim()).not.toBe("");
  });
});
