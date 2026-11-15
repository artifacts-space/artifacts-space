import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

/** Tests that run SQL against the one shared test database (TEST_DATABASE_URL). */
const databaseTests = ["src/**/*.db.test.ts", "scripts/**/*.db.test.ts"];

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts", "e2e/support/**/*.test.ts"],
          exclude: [...configDefaults.exclude, ...databaseTests],
          // Bounded so tests stay light alongside dev servers and builds.
          maxWorkers: 2,
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: databaseTests,
          // One file at a time, from every command: the files share one
          // database, and several count or trim the same tables.
          fileParallelism: false,
          // After the unit tests, never beside them.
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
