import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as confirmationSchema from "./confirmation-schema";
import * as connectionSchema from "./connection-schema";
import * as editLeaseSchema from "./edit-lease-schema";
import * as fileCopySchema from "./file-copy-schema";
import * as frameCaptureSchema from "./frame-capture-schema";
import * as notificationSchema from "./notification-schema";
import * as oauthSchema from "./oauth-schema";
import * as rolesSchema from "./roles-schema";
import * as appSchema from "./schema";
import * as teamWelcomeSchema from "./team-welcome-schema";
import * as viewsSchema from "./views-schema";

const schema = { ...appSchema, ...confirmationSchema, ...oauthSchema, ...viewsSchema, ...notificationSchema, ...rolesSchema, ...connectionSchema, ...fileCopySchema, ...teamWelcomeSchema, ...editLeaseSchema, ...frameCaptureSchema };

let database: ReturnType<typeof createDatabase> | undefined;

function createDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. Add your Neon connection string to .env.local.");
  }

  const hostname = new URL(databaseUrl).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return drizzlePostgres({ client: new Pool({ connectionString: databaseUrl }), schema });
  }

  return drizzleNeon({ client: neon(databaseUrl), schema });
}

export function getDb() {
  database ??= createDatabase();
  return database;
}
