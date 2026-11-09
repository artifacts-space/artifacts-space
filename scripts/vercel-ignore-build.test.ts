import { describe, expect, it } from "vitest";

import { decideBuild, isUnreadByApp } from "./vercel-ignore-build.mjs";

const preview = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/docs" };

describe("decideBuild", () => {
  it("should build when the deploy is production, even for a merge queue ref", () => {
    const env = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "gh-readonly-queue/main/pr-1-abc" };
    expect(decideBuild({ env, changedFiles: ["README.md"] }).build).toBe(true);
  });

  it("should build when production changed only files the app never reads", () => {
    expect(decideBuild({ env: { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }, changedFiles: ["README.md"] }).build).toBe(true);
  });

  it("should build when the environment is missing or unknown", () => {
    expect(decideBuild({ env: {}, changedFiles: ["README.md"] }).build).toBe(true);
    expect(decideBuild({ env: { VERCEL_ENV: "development" }, changedFiles: ["README.md"] }).build).toBe(true);
  });

  it("should skip when a preview is a merge queue branch", () => {
    const env = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "gh-readonly-queue/main/pr-42-0123abcd" };
    expect(decideBuild({ env, changedFiles: null })).toEqual({ build: false, reason: expect.stringContaining("merge queue") as string });
  });

  it("should not treat a branch that only mentions the queue as a merge queue branch", () => {
    const env = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "fix/gh-readonly-queue/notes" };
    expect(decideBuild({ env, changedFiles: ["src/app/page.tsx"] }).build).toBe(true);
  });

  it("should build when there is no earlier deployed commit to compare with", () => {
    expect(decideBuild({ env: preview, changedFiles: null }).build).toBe(true);
  });

  it("should build when the diff lists no files", () => {
    expect(decideBuild({ env: preview, changedFiles: [] }).build).toBe(true);
  });

  it("should skip when a preview changed only docs, GitHub settings, and README images", () => {
    const changedFiles = ["README.md", "AGENTS.md", "CLAUDE.md", "LICENSE", ".github/ISSUE_TEMPLATE/bug_report.yml", ".github/workflows/ci.yml", "docs/images/hero.webp"];
    expect(decideBuild({ env: preview, changedFiles }).build).toBe(false);
  });

  it("should build when any changed file is one the app reads", () => {
    const decision = decideBuild({ env: preview, changedFiles: ["README.md", "src/app/docs/mcp/page.tsx"] });
    expect(decision).toEqual({ build: true, reason: "Building: src/app/docs/mcp/page.tsx changed." });
  });
});

describe("isUnreadByApp", () => {
  it("should count root docs, .github, and README images as unread", () => {
    for (const path of ["README.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md", ".github/dependabot.yml", ".github/CODEOWNERS", "docs/images/hero.webp"]) {
      expect(isUnreadByApp(path)).toBe(true);
    }
  });

  it("should count app code, config, migrations, and nested markdown as read", () => {
    const read = ["src/app/docs/page.tsx", "src/lib/README.md", "public/robots.txt", "drizzle/0001_init.sql", "package.json", "pnpm-lock.yaml", "vercel.json", "next.config.ts", "scripts/migrate-on-deploy.mts", ".nvmrc", "docs/guide.md", "readme.md", ".githubx/file"];
    for (const path of read) {
      expect(isUnreadByApp(path)).toBe(false);
    }
  });
});
