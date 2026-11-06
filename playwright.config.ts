import { defineConfig, devices } from "@playwright/test";

/** Dev server port. Each agent worktree runs its own; set PLAYWRIGHT_PORT to match. */
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000);

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
    { name: "phone", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `pnpm exec next dev -p ${String(port)}`,
    url: `http://localhost:${String(port)}/dev/components`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
