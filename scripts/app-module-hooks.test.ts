import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/*
 * The owner's seed script loads the app's services in plain Node through
 * scripts/app-module-hooks.mts. These tests run that in a child process with
 * the script's own Node flags and no database, so a change under src/lib that
 * plain Node cannot load (syntax it cannot strip, a component, a request-only
 * Next import at module level) fails `pnpm check`, on every Node version CI
 * and the owner use.
 */

/** The Node flags of the `reviewer:seed` script in package.json, without the script's path. */
function seedNodeFlags(): string[] {
  const scripts = (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts;
  return (scripts["reviewer:seed"] ?? "").split(" ").slice(1, -1);
}

/** Runs a module-mode snippet in a child with the seed script's flags and no database URL. */
function runInChild(code: string) {
  return spawnSync(process.execPath, [...seedNodeFlags(), "--input-type=module", "--eval", code], { env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" }, encoding: "utf8", timeout: 120_000 });
}

const register = `const hooks = await import("./scripts/app-module-hooks.mts"); hooks.registerAppModuleHooks();`;

describe("app module hooks", () => {
  it("should load the seed script's app modules in plain Node when there is no database", () => {
    const run = runInChild(`${register} const data = await import("./scripts/seed-reviewer-demo-data.mts"); console.log(typeof data.seedReviewerDemo, typeof data.assertSeedLanded);`);

    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout.trim()).toBe("function function");
  });

  it("should use only Node flags this Node accepts when the seed command starts", () => {
    const run = spawnSync(process.execPath, [...seedNodeFlags(), "--eval", "0"], { encoding: "utf8", timeout: 60_000 });

    expect(run.status, run.stderr).toBe(0);
  });

  it("should report how many background tasks failed when work handed to after rejects", () => {
    const run = runInChild(
      `${register} const tasks = globalThis[Symbol.for("artifacts-space.app-module-hooks.after")]; tasks.push(Promise.resolve(), Promise.reject(new Error("no"))); console.log(await hooks.settleAfterTasks(), await hooks.settleAfterTasks());`,
    );

    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout.trim()).toBe("1 0");
  });
});
