import { defineConfig, devices } from "@playwright/test";

/** Dev server port. Each agent worktree runs its own; set PLAYWRIGHT_PORT to match. */
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
/**
 * Production server port, for the `*.prod.spec.ts` checks that need real
 * production HTML (font preloads). Playwright builds and starts it, and stops
 * it afterwards. It never reuses a server already on the port, so a stray
 * server cannot stand in for this build.
 */
const prodPort = Number(process.env.PLAYWRIGHT_PROD_PORT ?? port + 1000);

const prodSpecs = /\.prod\.spec\.ts$/;

/**
 * The production checks run with no reachable database, as in CI. Better Auth
 * still needs a site URL, a secret, and a database URL to start, so it can
 * reject a forged session cookie (signed-in-redirect.prod.spec.ts); nothing
 * listens on the database URL, so every query fails as it would with no
 * database. Set values win.
 */
const productionTestEnv = {
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? `http://localhost:${String(prodPort)}`,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "e2e-only-secret-not-used-anywhere-else-0123456789",
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://e2e@127.0.0.1:9/none",
};

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${String(port)}`,
  },
  projects: [
    { name: "phone", testIgnore: prodSpecs, use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "desktop", testIgnore: prodSpecs, use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
    {
      name: "production",
      testMatch: prodSpecs,
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 }, baseURL: `http://localhost:${String(prodPort)}` },
    },
  ],
  webServer: [
    {
      command: `pnpm exec next dev -p ${String(port)}`,
      url: `http://localhost:${String(port)}/dev/components`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // `next build` writes .next/ and `next dev` writes .next/dev/, so both can run at once.
      command: `pnpm exec next build && pnpm exec next start -p ${String(prodPort)}`,
      url: `http://localhost:${String(prodPort)}/preview`,
      reuseExistingServer: false,
      timeout: 600_000,
      env: productionTestEnv,
    },
  ],
});
