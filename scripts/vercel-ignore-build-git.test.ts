import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { changedFilesSince } from "./vercel-ignore-build-git.mts";

/*
 * The git glue and the entry script against a throwaway repository: the
 * diff Vercel's ignored build step reads, and the exit code Vercel sees.
 *
 * Git hooks (such as Husky's pre-push, which runs these tests) export
 * GIT_DIR and friends, which would point every git call here at the real
 * repository. The tests drop them, pass identity with -c instead of
 * writing config, and refuse to run unless git resolves to the temp repo.
 */

const entryScript = join(dirname(fileURLToPath(import.meta.url)), "vercel-ignore-build.mts");
let repo = "";
const commits: Record<string, string> = {};

/** The test's environment without the GIT_* variables a hook exports. */
function envWithoutGit(): Record<string, string> {
  return Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => !entry[0].startsWith("GIT_") && entry[1] !== undefined));
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, env: envWithoutGit(), encoding: "utf8" }).trim();
}

const identity = ["-c", "user.email=test@example.com", "-c", "user.name=Test", "-c", "commit.gpgsign=false"];

function commitAll(name: string) {
  git("add", "-A");
  git(...identity, "commit", "-q", "-m", name);
  commits[name] = git("rev-parse", "HEAD");
}

function commit(name: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
  }
  commitAll(name);
}

function sha(name: string): string {
  const value = commits[name];
  if (value === undefined) throw new Error(`No commit named ${name}`);
  return value;
}

/** Runs the entry script in the repository at `head` and returns its exit code. */
function runStep(head: string, env: Record<string, string>): number | null {
  git("checkout", "-q", "--detach", head);
  const result = spawnSync(process.execPath, [entryScript], { cwd: repo, env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", ...env }, encoding: "utf8" });
  return result.status;
}

beforeAll(() => {
  for (const name of Object.keys(process.env)) {
    if (name.startsWith("GIT_")) vi.stubEnv(name, undefined);
  }
  repo = realpathSync(mkdtempSync(join(tmpdir(), "vercel-ignore-build-")));
  git("init", "-q");
  if (git("rev-parse", "--show-toplevel") !== repo) throw new Error("git does not resolve to the temporary repository; refusing to commit.");
  commit("base", { "README.md": "# App\n", "src/app/page.tsx": "export default 1;\n" });
  commit("docs", { "README.md": "# App, updated\n", ".github/workflows/ci.yml": "name: CI\n" });
  commit("code", { "src/app/page.tsx": "export default 2;\n" });
  mkdirSync(join(repo, "docs/images"), { recursive: true });
  git("mv", "src/app/page.tsx", "docs/images/page.tsx");
  commitAll("move");
});

afterAll(() => {
  vi.unstubAllEnvs();
  if (repo) rmSync(repo, { recursive: true, force: true });
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("changedFilesSince", () => {
  it("should list the paths changed between the deployed commit and HEAD", () => {
    git("checkout", "-q", "--detach", sha("docs"));
    expect(changedFilesSince(sha("base"), repo)?.sort()).toEqual([".github/workflows/ci.yml", "README.md"]);
  });

  it("should list both paths of a rename", () => {
    git("checkout", "-q", "--detach", sha("move"));
    expect(changedFilesSince(sha("code"), repo)?.sort()).toEqual(["docs/images/page.tsx", "src/app/page.tsx"]);
  });

  it("should return null when the deployed commit is unset, malformed, or missing", () => {
    expect(changedFilesSince(undefined, repo)).toBeNull();
    expect(changedFilesSince("", repo)).toBeNull();
    expect(changedFilesSince("HEAD~1", repo)).toBeNull();
    expect(changedFilesSince("0".repeat(40), repo)).toBeNull();
  });
});

describe("vercel-ignore-build entry script", () => {
  it("should exit 0 to skip when a preview changed only files the app never reads", () => {
    expect(runStep(sha("docs"), { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "docs", VERCEL_GIT_PREVIOUS_SHA: sha("base") })).toBe(0);
  });

  it("should exit 1 to build when a preview changed app code", () => {
    expect(runStep(sha("code"), { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "code", VERCEL_GIT_PREVIOUS_SHA: sha("docs") })).toBe(1);
  });

  it("should exit 1 to build when production changed only docs", () => {
    expect(runStep(sha("docs"), { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", VERCEL_GIT_PREVIOUS_SHA: sha("base") })).toBe(1);
  });

  it("should exit 0 to skip a merge queue branch", () => {
    expect(runStep(sha("code"), { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "gh-readonly-queue/main/pr-1-abc" })).toBe(0);
  });

  it("should exit 1 to build when the deployed commit is not in the clone", () => {
    expect(runStep(sha("docs"), { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "docs", VERCEL_GIT_PREVIOUS_SHA: "f".repeat(40) })).toBe(1);
  });
});
