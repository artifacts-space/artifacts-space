import { and, desc, eq, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { artifactEditLease } from "@/db/edit-lease-schema";
import { artifact, artifactVersion } from "@/db/schema";
import { loadActor } from "@/lib/agents/queries";
import { harnessFor } from "@/lib/harness/harnesses";

import { EDIT_LEASE_MS, EDIT_SIGNAL_INTERVAL_MS, type BaseVersion, type ChangedBy } from "./edit-conflict-rules";

/**
 * The database side of edit-conflict-rules.ts: edit leases, and the SQL
 * conditions every save puts in its own UPDATE, so the check and the write
 * are one statement (neon-http has no interactive transactions). Artifact ids
 * are bound as values, never compared column to column (see the tripwire in
 * AGENTS.md).
 */

/** SQL: a person's edit lease on this artifact is live, by the database clock. */
export function liveLeaseCondition(artifactId: string) {
  return sql`exists (select 1 from ${artifactEditLease} l where l.artifact_id = ${artifactId} and l.expires_at > now())`;
}

/** SQL: the artifact is still at `updatedAt`, to the millisecond (Postgres keeps microseconds; tokens and the browser carry milliseconds). */
export function stillAt(updatedAt: Date) {
  return sql`date_trunc('milliseconds', ${artifact.updatedAt}) = ${updatedAt.toISOString()}::timestamptz`;
}

/**
 * The condition an agent's save adds to its UPDATE: with a base version, the
 * artifact must still be at it; without one, a change to the title, content,
 * or format needs no person's lease to be live. Undefined: no condition.
 */
export function agentWriteCondition(artifactId: string, input: { base: BaseVersion | undefined; guarded: boolean }) {
  if (input.base) return stillAt(input.base.updatedAt);
  return input.guarded ? sql`not ${liveLeaseCondition(artifactId)}` : undefined;
}

/**
 * SQL: a version saved by a person (in the web app, or a person's restore or
 * file change), from the version's own `by_agent`, or for versions from
 * before that column, from its harness (none: the web app). `alias` is the
 * name the query gives `artifact_version`, so the fragment always names a
 * table that is in its FROM clause.
 */
export function personVersion(alias: string): SQL {
  const table = sql.identifier(alias);
  return sql`coalesce(${table}.by_agent, ${table}.harness is not null) = false`;
}

/**
 * The relaxed condition a person's web save falls back to when the artifact
 * moved on from the editor's base (`expected`): every save since was an
 * agent's. All three parts must hold:
 *
 * - The base is a save time the artifact has had: not later than its last
 *   save. A base from the future would pass the other two against everyone.
 * - No person saved after the base by `person_saved_at`, which every person's
 *   save sets in its own UPDATE (null: none since the column was added).
 * - No version a person saved is later than the base. Versions are filed just
 *   after the UPDATE, which the column covers; the versions cover saves the
 *   column never saw (rows from before it, and saves by the previous
 *   deployment while a new one rolls out).
 *
 * Save times are the database's, in whole milliseconds (save-time.ts), so
 * the comparisons are exact; older values are truncated to match. The
 * artifact id is bound as a value, never a bare column inside the subquery
 * (the correlated-subquery tripwire in AGENTS.md).
 */
export function onlyAgentsSavedSince(artifactId: string, expected: Date) {
  const base = sql`${expected.toISOString()}::timestamptz`;
  const notAhead = sql`date_trunc('milliseconds', ${artifact.updatedAt}) >= ${base}`;
  const noPersonSaveRecorded = sql`(${artifact.personSavedAt} is null or date_trunc('milliseconds', ${artifact.personSavedAt}) <= ${base})`;
  const noPersonVersion = sql`not exists (select 1 from ${artifactVersion} v where v.artifact_id = ${artifactId} and ${personVersion("v")} and date_trunc('milliseconds', v.saved_at) > ${base})`;
  return sql`(${notAhead} and ${noPersonSaveRecorded} and ${noPersonVersion})`;
}

/** Whether a person's edit lease on the artifact is live now, by the database clock. */
export async function hasLiveLease(artifactId: string): Promise<boolean> {
  const result = await getDb().execute<{ live: boolean }>(sql`select ${liveLeaseCondition(artifactId)} as live`);
  return result.rows[0]?.live === true;
}

/** The person whose lease is live on the artifact (the latest to expire), or null. */
export async function liveLeaseHolder(artifactId: string): Promise<string | null> {
  const result = await getDb().execute<{ user_id: string }>(sql`
    select l.user_id from ${artifactEditLease} l
    where l.artifact_id = ${artifactId} and l.expires_at > now()
    order by l.expires_at desc limit 1
  `);
  return result.rows[0]?.user_id ?? null;
}

/**
 * Starts or renews the person's lease: it lasts EDIT_LEASE_MS from now by
 * the database clock. The caller checks that the person may edit it.
 */
export async function renewEditLease(artifactId: string, userId: string): Promise<void> {
  const seconds = EDIT_LEASE_MS / 1000;
  await getDb()
    .insert(artifactEditLease)
    .values({ artifactId, userId, expiresAt: sql`now() + make_interval(secs => ${seconds})` })
    .onConflictDoUpdate({ target: [artifactEditLease.artifactId, artifactEditLease.userId], set: { expiresAt: sql`now() + make_interval(secs => ${seconds})` } });
}

/**
 * Ends a person's edit lease on an artifact soon, when one of their editors
 * closes: within one signal interval instead of a full lease. The lease is
 * per person, not per tab, so it is not deleted outright: another editor of
 * theirs still typing on the artifact signals within that interval and keeps it.
 */
export async function endEditLease(artifactId: string, userId: string): Promise<void> {
  const seconds = EDIT_SIGNAL_INTERVAL_MS / 1000;
  await getDb()
    .update(artifactEditLease)
    .set({ expiresAt: sql`least(${artifactEditLease.expiresAt}, now() + make_interval(secs => ${seconds}))` })
    .where(and(eq(artifactEditLease.artifactId, artifactId), eq(artifactEditLease.userId, userId)));
}

/** Deletes leases that ended more than an hour ago; the cleanup job runs it. Returns how many went. */
export async function pruneExpiredLeases(): Promise<number> {
  const result = await getDb().execute<{ artifact_id: string }>(sql`
    delete from ${artifactEditLease} where expires_at < now() - interval '1 hour' returning artifact_id
  `);
  return result.rows.length;
}

/** A person's handle, or null when they are gone. */
async function handleOf(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const actor = await loadActor(userId);
  return actor?.handle ?? null;
}

/**
 * Who saved the artifact last, for a refused agent: their handle, and the
 * agent harness of the newest version (null when it was saved in the web
 * app). Best effort: an unknown editor comes back as null.
 */
export async function lastSavedBy(artifactId: string): Promise<ChangedBy | null> {
  const [row] = await getDb()
    .select({ createdBy: artifactVersion.createdBy, harness: artifactVersion.harness })
    .from(artifactVersion)
    .where(eq(artifactVersion.artifactId, artifactId))
    .orderBy(desc(artifactVersion.savedAt), desc(artifactVersion.id))
    .limit(1);
  if (!row) return null;
  const harness = row.harness ? harnessFor(row.harness) : null;
  return { handle: await handleOf(row.createdBy), harness: harness ? { id: harness.id, name: harness.name } : null };
}

/** The person typing in the artifact, for an agent refused by their lease. */
export async function editingPerson(artifactId: string): Promise<ChangedBy | null> {
  const holder = await liveLeaseHolder(artifactId);
  return holder ? { handle: await handleOf(holder), harness: null } : null;
}
