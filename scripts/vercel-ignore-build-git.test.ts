import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
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
function envWithoutGit(): NodeJS.ProcessEnv {
  const kept = Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"));
  return { ...Object.fromEntries(kept), NODE_ENV: "test" };
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

/** What the entry script did: its exit code, and what it printed for the build log. */
interface StepResult {
  status: number | null;
  log: string;
}

/** Runs the entry script in `cwd` (the test repository unless given) and returns its exit code and output. */
function runIn(cwd: string, env: Record<string, string>): StepResult {
  const result = spawnSync(process.execPath, [entryScript], { cwd, env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", ...env }, encoding: "utf8" });
  return { status: result.status, log: `${result.stdout}${result.stderr}`.trim() };
}

/** Runs the entry script in the test repository at `head`. */
function runStep(head: string, env: Record<string, string>): StepResult {
  git("checkout", "-q", "--detach", head);
  return runIn(repo, env);
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
    const { status, log } = runStep(sha("docs"), { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "docs", VERCEL_GIT_PREVIOUS_SHA: sha("base") });
    expect(status, log).toBe(0);
  });

  it("should exit 1 to build when a preview changed app code", () => {
    const { status, log } = runStep(sha("code"), { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "code", VERCEL_GIT_PREVIOUS_SHA: sha("docs") });
    expect(status, log).toBe(1);
  });

  it("should exit 1 to build when production changed only docs", () => {
    const { status, log } = runStep(sha("docs"), { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", VERCEL_GIT_PREVIOUS_SHA: sha("base") });
    expect(status, log).toBe(1);
  });

  it("should exit 0 to skip a merge queue branch", () => {
    const { status, log } = runStep(sha("code"), { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "gh-readonly-queue/main/pr-1-abc" });
    expect(status, log).toBe(0);
  });

  it("should exit 1 to build when the deployed commit is not in the clone or on the remote", () => {
    const { status, log } = runStep(sha("docs"), { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "docs", VERCEL_GIT_PREVIOUS_SHA: "f".repeat(40) });
    expect(status, log).toBe(1);
  });
});

describe("a shallow clone without the deployed commit", () => {
  let shallow = "";

  /** git in the shallow clone, without the hook's GIT_* variables. */
  function shallowGit(...args: string[]): string {
    return execFileSync("git", args, { cwd: shallow, env: envWithoutGit(), encoding: "utf8" }).trim();
  }

  beforeAll(() => {
    // Like Vercel: a depth-1 clone of the deployed branch, whose earlier deploy is not in it.
    const origin = join(dirname(repo), `${basename(repo)}-origin.git`);
    execFileSync("git", ["clone", "-q", "--bare", repo, origin], { env: envWithoutGit() });
    shallow = `${repo}-shallow`;
    mkdirSync(shallow);
    shallowGit("init", "-q");
    if (shallowGit("rev-parse", "--show-toplevel") !== shallow) throw new Error("git does not resolve to the shallow clone; refusing to run.");
    shallowGit("remote", "add", "origin", `file://${origin}`);
    shallowGit("fetch", "-q", "--depth=1", "origin", sha("docs"));
    shallowGit("checkout", "-q", "--detach", "FETCH_HEAD");
  });

  afterAll(() => {
    rmSync(shallow, { recursive: true, force: true });
    rmSync(`${repo}-origin.git`, { recursive: true, force: true });
  });

  it("should fetch the deployed commit and skip a docs-only preview", () => {
    expect(() => shallowGit("cat-file", "-e", `${sha("base")}^{commit}`)).toThrow();
    const { status, log } = runIn(shallow, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "docs", VERCEL_GIT_PREVIOUS_SHA: sha("base") });
    expect(status, log).toBe(0);
    expect(log).toContain("Skipping: only files the app never reads changed");
  });

  it("should list the same changed paths after fetching the deployed commit", () => {
    expect(changedFilesSince(sha("base"), shallow)?.sort()).toEqual([".github/workflows/ci.yml", "README.md"]);
  });
});
