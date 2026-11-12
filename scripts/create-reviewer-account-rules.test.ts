import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ALLOW_SHARED_REVIEWER_ACCOUNT,
  isReviewerEmail,
  isStrongEnough,
  MIN_PASSWORD_LENGTH,
  PASSWORD_BYTES,
  parseReviewerArgs,
  reviewerDatabase,
  sampleArtifacts,
} from "./create-reviewer-account-rules.mts";

const base = ["--email", "Reviewer@Artifacts.Space", "--name", "Directory reviewer", "--username", "Reviewer-One"];

describe("parseReviewerArgs", () => {
  it("should read the email, name, and username, lowercased where they are identifiers", () => {
    expect(parseReviewerArgs(base)).toEqual({ ok: true, request: { email: "reviewer@artifacts.space", name: "Directory reviewer", username: "reviewer-one", resetPassword: false } });
  });

  it("should reset only when asked with --reset-password", () => {
    const parsed = parseReviewerArgs([...base, "--reset-password"]);
    expect(parsed.ok && parsed.request.resetPassword).toBe(true);
  });

  it.each([
    ["an outside domain", "reviewer@gmail.com"],
    ["a look-alike domain", "reviewer@artifacts.space.evil.example"],
    ["a subdomain", "reviewer@mail.artifacts.space"],
    ["no address", "reviewer"],
  ])("should refuse %s", (_label, email) => {
    expect(parseReviewerArgs(["--email", email, "--name", "R", "--username", "reviewer"]).ok).toBe(false);
  });

  it("should accept an @example.com address for local tests", () => {
    expect(parseReviewerArgs(["--email", "reviewer@example.com", "--name", "R", "--username", "reviewer"]).ok).toBe(true);
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

describe("isReviewerEmail", () => {
  it("should accept only the site's domain and the reserved test domain", () => {
    expect(isReviewerEmail("a@artifacts.space")).toBe(true);
    expect(isReviewerEmail("a@example.com")).toBe(true);
    expect(isReviewerEmail("a@example.com.evil.example")).toBe(false);
    expect(isReviewerEmail("@artifacts.space")).toBe(false);
  });
});

describe("reviewerDatabase", () => {
  const local = "postgres://ci:ci@127.0.0.1:55473/artifacts_test";
  const shared = "postgres://owner:secret@ep-example.neon.tech/neondb";

  it("should use a database on this machine", () => {
    expect(reviewerDatabase({ DATABASE_URL: local })).toEqual({ ok: true, url: local });
  });

  it("should prefer the direct connection when both are set", () => {
    expect(reviewerDatabase({ DATABASE_URL: shared, DATABASE_URL_UNPOOLED: local })).toEqual({ ok: true, url: local });
  });

  it("should stop before it connects to a shared database without the flag, and never show the URL", () => {
    const result = reviewerDatabase({ DATABASE_URL: shared });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("neon.tech");
    expect(reviewerDatabase({ DATABASE_URL: shared, ALLOW_SHARED_MIGRATE: "1" }).ok).toBe(false);
    expect(reviewerDatabase({ DATABASE_URL: shared, [ALLOW_SHARED_REVIEWER_ACCOUNT]: "true" }).ok).toBe(false);
  });

  it("should reach a shared database only when the flag is set to 1 for the run", () => {
    expect(reviewerDatabase({ DATABASE_URL: shared, [ALLOW_SHARED_REVIEWER_ACCOUNT]: "1" })).toEqual({ ok: true, url: shared });
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
