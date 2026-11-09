/**
 * Vercel's ignored build step (`ignoreCommand` in vercel.json). Vercel runs it
 * after cloning and before installing: exit 0 skips the build, any other exit
 * builds. The rules are in vercel-ignore-build-rules.mts.
 *
 * This file only runs; it exports nothing and has no entry-point check, so
 * however Vercel calls it, it decides. Any error exits 1, which builds.
 * Run with: node scripts/vercel-ignore-build.mts
 */
import { changedFilesSince } from "./vercel-ignore-build-git.mts";
import { decideBuild, exitCodeFor } from "./vercel-ignore-build-rules.mts";

const env = process.env;
const changedFiles = env.VERCEL_ENV === "preview" ? changedFilesSince(env.VERCEL_GIT_PREVIOUS_SHA) : null;
const decision = decideBuild({ env, changedFiles });
console.log(decision.reason);
process.exitCode = exitCodeFor(decision);
