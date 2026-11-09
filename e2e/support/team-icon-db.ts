import { Pool } from "pg";

import { headObject, r2ConfigFromEnv } from "../../src/lib/files/r2";

import { localDatabaseEnabled, localDatabaseSkipReason } from "./local-db";

/**
 * Helpers for the team icon checks: the icon key a team stores, and whether
 * its object is in storage. They need a local throwaway database (like
 * local-db.ts) and a local S3-compatible store such as MinIO, named by
 * R2_ENDPOINT on localhost with E2E_LOCAL_R2=1, so they never touch real R2.
 */

/** True when the specs that store real icon bytes may run. */
export function localStorageEnabled(): boolean {
  const endpoint = process.env.R2_ENDPOINT;
  if (!localDatabaseEnabled() || process.env.E2E_LOCAL_R2 !== "1" || !endpoint) return false;
  const host = new URL(endpoint).hostname;
  return host === "localhost" || host === "127.0.0.1";
}

export const localStorageSkipReason = `${localDatabaseSkipReason} Also set E2E_LOCAL_R2=1 and R2_ENDPOINT (plus the R2_* keys) to a local MinIO with the bucket created.`;

let pool: Pool | null = null;

function db(): Pool {
  if (!localDatabaseEnabled()) throw new Error(localDatabaseSkipReason);
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

/** The icon key a team stores, or null. */
export async function teamLogoOf(teamId: string): Promise<string | null> {
  const result = await db().query<{ logo: string | null }>(`select logo from team where id = $1`, [teamId]);
  return result.rows[0]?.logo ?? null;
}

/** Whether an object exists in the local store. */
export async function storedObjectExists(key: string): Promise<boolean> {
  if (!localStorageEnabled()) throw new Error(localStorageSkipReason);
  return (await headObject(r2ConfigFromEnv(), key)) !== null;
}

/** Closes this file's connections. */
export async function closeTeamIconDb(): Promise<void> {
  await pool?.end();
  pool = null;
}
