import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts", "e2e/support/**/*.test.ts"],
    environment: "node",
    // Bounded so tests stay light alongside dev servers and builds.
    maxWorkers: 2,
  },
});
