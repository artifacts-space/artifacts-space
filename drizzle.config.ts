import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read .env.local on its own.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  dialect: "postgresql",
  // OAuth and view-count tables live in their own files to keep schema.ts under the 500-line limit.
  schema: ["./src/db/schema.ts", "./src/db/oauth-schema.ts", "./src/db/views-schema.ts"],
  out: "./drizzle",
  // Only manage this app's tables. Ignore the unused neon_auth schema.
  schemaFilter: ["public"],
  dbCredentials: {
    // Migrations use the direct connection, not the pooler.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
