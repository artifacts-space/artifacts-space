/**
 * The git side of Vercel's ignored build step: which paths changed since the
 * last deployed commit. Node built-ins only, because the step runs before
 * `pnpm install`.
 */
import { execFileSync } from "node:child_process";

import { isCommitSha } from "./vercel-ignore-build-rules.mts";

/** Longest a git command may take before the step gives up and builds. */
const GIT_TIMEOUT_MS = 30_000;

/** The first line of git's stderr, or of the error message, for the build log. */
function failureDetail(error: unknown): string {
  const stderr = typeof error === "object" && error !== null && "stderr" in error ? error.stderr : undefined;
  const text = typeof stderr === "string" && stderr.trim() ? stderr : error instanceof Error ? error.message : "unknown error";
  return text.trim().split("\n")[0] ?? "unknown error";
}

/** Runs git in `cwd` and returns its output, or null when it fails. The failure goes to the build log. */
function git(cwd: string, args: readonly string[]): string | null {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: GIT_TIMEOUT_MS });
  } catch (error) {
    console.error(`git ${args[0] ?? ""} failed: ${failureDetail(error)}`);
    return null;
  }
}

function hasCommit(cwd: string, sha: string): boolean {
  return git(cwd, ["cat-file", "-e", `${sha}^{commit}`]) !== null;
}

/**
 * Makes sure `sha` is in the clone. Vercel clones shallowly, so an older
 * deployed commit may be missing; fetch just that commit. False when it
 * still cannot be found.
 */
function ensureCommit(cwd: string, sha: string): boolean {
  if (hasCommit(cwd, sha)) return true;
  if (git(cwd, ["fetch", "--quiet", "--no-tags", "--depth=1", "origin", sha]) === null) return false;
  return hasCommit(cwd, sha);
}

/**
 * Paths changed between the last deployed commit and HEAD, or null when that
 * commit is not set, not a full SHA, or cannot be found. Renames list both
 * paths, so moving a file out of src/ still counts as a change to src/.
 */
export function changedFilesSince(previousSha: string | undefined, cwd: string = process.cwd()): string[] | null {
  const base = previousSha?.trim();
  if (!isCommitSha(base)) return null;
  if (!ensureCommit(cwd, base)) return null;
  const output = git(cwd, ["diff", "--name-only", "--no-renames", "-z", base, "HEAD"]);
  if (output === null) return null;
  return output.split("\0").filter(Boolean);
}
