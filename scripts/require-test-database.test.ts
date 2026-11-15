import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("./require-test-database.mts", import.meta.url));

/** Runs the guard with only the given TEST_DATABASE_URL in its environment. */
function runGuard(testDatabaseUrl?: string) {
  const env = { NODE_ENV: "test" as const, PATH: process.env.PATH ?? "", ...(testDatabaseUrl === undefined ? {} : { TEST_DATABASE_URL: testDatabaseUrl }) };
  return spawnSync(process.execPath, [script], { env, encoding: "utf8" });
}

describe("require-test-database", () => {
  it("should exit 1 and name the variable when TEST_DATABASE_URL is unset", () => {
    const result = runGuard();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("TEST_DATABASE_URL");
  });

  it("should exit 1 when TEST_DATABASE_URL is blank", () => {
    expect(runGuard("   ").status).toBe(1);
  });

  it("should exit 0 and print nothing when TEST_DATABASE_URL is set", () => {
    const result = runGuard("postgres://user@localhost:5432/throwaway");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});
