/**
 * Vercel's ignored build step (`ignoreCommand` in vercel.json). Vercel runs it
 * after cloning and before installing: exit 0 skips the build, exit 1 builds.
 *
 * It skips only preview builds that cannot change the deployed app: merge
 * queue branches (the queue's CI is the gate, and main deploys after merge)
 * and changes to files the app never reads, such as README or .github/.
 * Production builds always run, because they apply the database migrations
 * (scripts/migrate-on-deploy.mts). When in doubt it builds: an unknown
 * environment, a missing or unfetched diff base, an empty diff, or any error.
 *
 * It runs before `pnpm install`, so it uses Node built-ins only.
 * Run with: node scripts/vercel-ignore-build.mts
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

type Env = Readonly<Record<string, string | undefined>>;

/** What the build step decided, and why, for the build log. */
export interface BuildDecision {
  build: boolean;
  reason: string;
}

/** What the decision needs from the build: the environment and the files changed since the last deployed commit. */
export interface BuildInput {
  env: Env;
  /** Paths changed since VERCEL_GIT_PREVIOUS_SHA, or null when that commit is unknown or not in the clone. */
  changedFiles: readonly string[] | null;
}

/** Merge queue branches, such as gh-readonly-queue/main/pr-12-<sha>. */
const MERGE_QUEUE_PREFIX = "gh-readonly-queue/";

/**
 * Root files the deployed app never reads. The /docs pages are TSX under
 * src/app/docs, not built from these files, and the app only links to
 * SECURITY.md on GitHub.
 */
const unreadRootFiles = new Set(["README.md", "AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md", "LICENSE"]);

/**
 * Folders the deployed app never reads: GitHub settings, workflows, and issue
 * templates (Vercel runs none of them), and the README's screenshots.
 */
const unreadFolders = [".github/", "docs/images/"];

/** True when the deployed app never reads `path`, so changing it alone needs no new preview. */
export function isUnreadByApp(path: string): boolean {
  return unreadRootFiles.has(path) || unreadFolders.some((folder) => path.startsWith(folder));
}

/** Decides whether Vercel builds this commit. Pure, so every rule is tested without git. */
export function decideBuild({ env, changedFiles }: BuildInput): BuildDecision {
  if (env.VERCEL_ENV === "production") return { build: true, reason: "Production builds always run: they apply the database migrations." };
  if (env.VERCEL_ENV !== "preview") return { build: true, reason: `Building: unknown environment "${env.VERCEL_ENV ?? ""}".` };
  if (env.VERCEL_GIT_COMMIT_REF?.startsWith(MERGE_QUEUE_PREFIX)) {
    return { build: false, reason: "Skipping: merge queue branch. CI checks it, and main deploys after the merge." };
  }
  if (changedFiles === null) return { build: true, reason: "Building: no earlier deployed commit to compare with." };
  if (changedFiles.length === 0) return { build: true, reason: "Building: no changed files found since the last deployed commit." };
  const read = changedFiles.find((path) => !isUnreadByApp(path));
  if (read !== undefined) return { build: true, reason: `Building: ${read} changed.` };
  return { build: false, reason: `Skipping: only files the app never reads changed (${String(changedFiles.length)}).` };
}

/** Runs git and returns its output, or null when it fails. */
function git(args: readonly string[]): string | null {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

/**
 * Paths changed between the last deployed commit and HEAD, or null when that
 * commit is not set or not in the (shallow) clone. Renames list both paths.
 */
export function changedFilesSince(previousSha: string | undefined): string[] | null {
  const base = previousSha?.trim();
  if (!base) return null;
  if (git(["cat-file", "-e", `${base}^{commit}`]) === null) return null;
  const output = git(["diff", "--name-only", "--no-renames", "-z", base, "HEAD"]);
  if (output === null) return null;
  return output.split("\0").filter(Boolean);
}

function main(env: Env): number {
  const changedFiles = env.VERCEL_ENV === "preview" ? changedFilesSince(env.VERCEL_GIT_PREVIOUS_SHA) : null;
  const decision = decideBuild({ env, changedFiles });
  console.log(decision.reason);
  return decision.build ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.env);
}
