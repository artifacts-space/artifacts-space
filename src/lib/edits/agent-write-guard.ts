import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { artifactEditLease } from "@/db/edit-lease-schema";
import { artifact, artifactVersion } from "@/db/schema";
import { loadActor } from "@/lib/agents/queries";
import { harnessFor } from "@/lib/harness/harnesses";

import { EDIT_LEASE_MS, type BaseVersion, type ChangedBy } from "./edit-conflict-rules";

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
 * The relaxed condition a person's web save falls back to when the artifact
 * moved on from the editor's base: every save since was an agent's, because
 * no person saved after the base (person_saved_at, null on older rows, which
 * then reads as the last save time and so refuses as before).
 */
export function onlyAgentsSavedSince(expected: Date) {
  return sql`date_trunc('milliseconds', coalesce(${artifact.personSavedAt}, ${artifact.updatedAt})) <= ${expected.toISOString()}::timestamptz`;
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

/** Ends a person's edit lease on an artifact at once, when their editor closes. */
export async function endEditLease(artifactId: string, userId: string): Promise<void> {
  await getDb().delete(artifactEditLease).where(and(eq(artifactEditLease.artifactId, artifactId), eq(artifactEditLease.userId, userId)));
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
