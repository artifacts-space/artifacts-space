import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { drizzleDatabaseUrl, drizzleKitCommand, e2eDevServerDatabaseEnv, isLocalDatabaseUrl, sharedMigrateRefusal } from "./database-url-rules";

const shared = "postgres://app:secret@ep-shared.example.neon.tech/app";
const sharedDirect = "postgres://app:secret@ep-shared-direct.example.neon.tech/app";
const local = "postgres://ci:ci@localhost:55432/artifacts_test";
const file = { DATABASE_URL: shared, DATABASE_URL_UNPOOLED: sharedDirect };

describe("drizzleDatabaseUrl", () => {
  it("should use DATABASE_URL for both connections when it is the only one set for the run", () => {
    expect(drizzleDatabaseUrl({ DATABASE_URL: local }, file)).toBe(local);
  });

  it("should prefer the run's DATABASE_URL_UNPOOLED over everything when it is set", () => {
    expect(drizzleDatabaseUrl({ DATABASE_URL: shared, DATABASE_URL_UNPOOLED: local }, file)).toBe(local);
  });

  it("should fall back to .env.local, direct connection first, when the run sets neither", () => {
    expect(drizzleDatabaseUrl({}, file)).toBe(sharedDirect);
    expect(drizzleDatabaseUrl({}, { DATABASE_URL: shared })).toBe(shared);
  });

  it("should treat a blank value as unset when the run exports an empty variable", () => {
    expect(drizzleDatabaseUrl({ DATABASE_URL_UNPOOLED: " ", DATABASE_URL: local }, file)).toBe(local);
    expect(drizzleDatabaseUrl({}, {})).toBe("");
  });
});

describe("sharedMigrateRefusal", () => {
  it("should stop migrate and push when the database is not on this machine", () => {
    for (const command of ["migrate", "push"]) {
      const refusal = sharedMigrateRefusal({ command, url: sharedDirect, env: {} });
      expect(refusal).toContain(`drizzle-kit ${command} stopped`);
      expect(refusal).not.toContain("secret");
      expect(refusal).not.toContain("neon.tech");
    }
  });

  it("should say no URL is set, not that it is remote, when there is none", () => {
    const refusal = sharedMigrateRefusal({ command: "migrate", url: "", env: { ALLOW_SHARED_MIGRATE: "1" } });
    expect(refusal).toContain("no database URL is set");
    expect(refusal).not.toContain("not on this machine");
  });

  it("should stop when the URL is malformed", () => {
    expect(sharedMigrateRefusal({ command: "migrate", url: "not a url", env: {} })).toContain("not on this machine");
  });

  it("should let migrate reach a database on this machine", () => {
    expect(sharedMigrateRefusal({ command: "migrate", url: local, env: {} })).toBeNull();
    expect(sharedMigrateRefusal({ command: "migrate", url: "postgres://u@127.0.0.1/db", env: {} })).toBeNull();
  });

  it("should let migrate reach a shared database only when ALLOW_SHARED_MIGRATE=1 is set", () => {
    expect(sharedMigrateRefusal({ command: "migrate", url: sharedDirect, env: { ALLOW_SHARED_MIGRATE: "1" } })).toBeNull();
    expect(sharedMigrateRefusal({ command: "migrate", url: sharedDirect, env: { ALLOW_SHARED_MIGRATE: "true" } })).not.toBeNull();
  });

  it("should not stop commands that never change the schema", () => {
    for (const command of ["generate", "studio", "check", null]) expect(sharedMigrateRefusal({ command, url: sharedDirect, env: {} })).toBeNull();
  });

  it("should not treat a host that only starts with localhost as local", () => {
    expect(isLocalDatabaseUrl("postgres://u@localhost.example.com/db")).toBe(false);
  });
});

describe("drizzleKitCommand", () => {
  it("should find the command in drizzle-kit's process arguments", () => {
    expect(drizzleKitCommand(["/usr/bin/node", "/repo/node_modules/drizzle-kit/bin.cjs", "migrate"])).toBe("migrate");
    expect(drizzleKitCommand(["node", "bin.cjs", "generate", "--custom", "--name", "migrate"])).toBe("generate");
    expect(drizzleKitCommand(["node", "vitest"])).toBeNull();
  });
});

describe("e2eDevServerDatabaseEnv", () => {
  it("should empty both URLs so .env.local cannot fill them when no local test database is set", () => {
    expect(e2eDevServerDatabaseEnv({})).toEqual({ DATABASE_URL: "", DATABASE_URL_UNPOOLED: "" });
    expect(e2eDevServerDatabaseEnv({ DATABASE_URL: shared })).toEqual({ DATABASE_URL: "", DATABASE_URL_UNPOOLED: "" });
  });

  it("should never pass a shared database on, even when E2E_LOCAL_DB=1 is set", () => {
    expect(e2eDevServerDatabaseEnv({ E2E_LOCAL_DB: "1", DATABASE_URL: shared })).toEqual({ DATABASE_URL: "", DATABASE_URL_UNPOOLED: "" });
  });

  it("should point both URLs at the local test database when E2E_LOCAL_DB=1 names one", () => {
    expect(e2eDevServerDatabaseEnv({ E2E_LOCAL_DB: "1", DATABASE_URL: local })).toEqual({ DATABASE_URL: local, DATABASE_URL_UNPOOLED: local });
  });
});

describe("next dev's .env.local loading", () => {
  it("should keep the empty URLs e2eDevServerDatabaseEnv sets when .env.local names a database", () => {
    // The e2e dev server relies on this: Next fills only variables that are not set at all.
    const require = createRequire(import.meta.url);
    const nextEnv = require(require.resolve("@next/env", { paths: [require.resolve("next/package.json")] })) as { loadEnvConfig: (dir: string, dev: boolean, log: object, force: boolean) => unknown };
    const dir = mkdtempSync(join(tmpdir(), "next-env-"));
    const saved = { DATABASE_URL: process.env.DATABASE_URL, DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED };
    try {
      writeFileSync(join(dir, ".env.local"), `DATABASE_URL=${shared}\nDATABASE_URL_UNPOOLED=${sharedDirect}\n`);
      Object.assign(process.env, e2eDevServerDatabaseEnv({}));
      nextEnv.loadEnvConfig(dir, true, { info: () => undefined, error: () => undefined }, true);
      expect(process.env.DATABASE_URL).toBe("");
      expect(process.env.DATABASE_URL_UNPOOLED).toBe("");
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) Reflect.deleteProperty(process.env, key);
        else process.env[key] = value;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the production migration path", () => {
  it("should not load drizzle.config.ts or drizzle-kit, so the local guard never applies to deploys", () => {
    const source = readFileSync("scripts/migrate-on-deploy.mts", "utf8");
    const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gmu)].map((match) => match[1]);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((from) => from?.includes("drizzle.config") === true || from?.startsWith("drizzle-kit") === true)).toEqual([]);
    expect(source).toContain('from "drizzle-orm/node-postgres/migrator"');
  });
});
