import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { defineConfig } from "drizzle-kit";

import { drizzleDatabaseUrl, drizzleKitCommand, sharedMigrateRefusal } from "./src/lib/db/database-url-rules";

// drizzle-kit does not read .env.local on its own. It is read here without
// touching process.env, so a URL set for this run always wins over it
// (drizzleDatabaseUrl). Production deploys never load this file: they migrate
// through scripts/migrate-on-deploy.mts.
const envFile = existsSync(".env.local") ? parseEnv(readFileSync(".env.local", "utf8")) : {};
const url = drizzleDatabaseUrl(process.env, envFile);

// migrate and push reach only a database on this machine, unless ALLOW_SHARED_MIGRATE=1.
const refusal = sharedMigrateRefusal({ command: drizzleKitCommand(process.argv), url, env: process.env });
if (refusal) throw new Error(refusal);

export default defineConfig({
  dialect: "postgresql",
  // OAuth, view-count, notification, team-role, MCP connection, old file copy, team welcome, and edit lease tables live in their own files to keep schema.ts under the 500-line limit.
  schema: ["./src/db/schema.ts", "./src/db/oauth-schema.ts", "./src/db/views-schema.ts", "./src/db/notification-schema.ts", "./src/db/roles-schema.ts", "./src/db/connection-schema.ts", "./src/db/file-copy-schema.ts", "./src/db/team-welcome-schema.ts", "./src/db/edit-lease-schema.ts"],
  out: "./drizzle",
  // Only manage this app's tables. Ignore the unused neon_auth schema.
  schemaFilter: ["public"],
  dbCredentials: {
    // Migrations use the direct connection, not the pooler.
    url,
  },
  strict: true,
  verbose: true,
});
