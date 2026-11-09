/**
 * The decision behind Vercel's ignored build step (scripts/vercel-ignore-build.mts).
 * Pure, so every rule is tested without git or Vercel.
 *
 * It skips only preview builds that cannot change the deployed app: merge
 * queue branches (the queue's CI is the gate, and main deploys after merge)
 * and changes to files the app never reads, such as README or .github/.
 * Production builds always run, because they apply the database migrations
 * (scripts/migrate-on-deploy.mts). When in doubt it builds: an unknown
 * environment, a missing or unfetched diff base, an empty diff, or any error.
 */

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

/** How many skipped paths the build log names. */
const LOGGED_PATHS = 5;

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

function namePaths(paths: readonly string[]): string {
  const named = paths.slice(0, LOGGED_PATHS).join(", ");
  return paths.length > LOGGED_PATHS ? `${named}, and ${String(paths.length - LOGGED_PATHS)} more` : named;
}

/** Decides whether Vercel builds this commit. */
export function decideBuild({ env, changedFiles }: BuildInput): BuildDecision {
  if (env.VERCEL_ENV === "production") return { build: true, reason: "Production builds always run: they apply the database migrations." };
  if (env.VERCEL_ENV !== "preview") return { build: true, reason: `Building: unknown environment "${env.VERCEL_ENV ?? ""}".` };
  // Merge queue previews are skipped by decision: CI's Build job catches compile errors there, and anything
  // that only fails with Vercel's real environment shows on the production deploy, where the old deployment
  // keeps serving until a build succeeds.
  if (env.VERCEL_GIT_COMMIT_REF?.startsWith(MERGE_QUEUE_PREFIX)) {
    return { build: false, reason: "Skipping: merge queue branch. CI checks it, and main deploys after the merge." };
  }
  if (changedFiles === null) return { build: true, reason: "Building: no earlier deployed commit to compare with." };
  if (changedFiles.length === 0) return { build: true, reason: "Building: no changed files found since the last deployed commit." };
  const read = changedFiles.find((path) => !isUnreadByApp(path));
  if (read !== undefined) return { build: true, reason: `Building: ${read} changed.` };
  return { build: false, reason: `Skipping: only files the app never reads changed: ${namePaths(changedFiles)}.` };
}

/** Vercel's convention, the reverse of the usual one: exit 0 skips the build, 1 builds. */
export function exitCodeFor(decision: BuildDecision): 0 | 1 {
  return decision.build ? 1 : 0;
}

/** A full commit SHA, so nothing else from the environment reaches git's arguments. */
export function isCommitSha(value: string | undefined): value is string {
  return value !== undefined && /^[0-9a-f]{40}$/.test(value);
}
