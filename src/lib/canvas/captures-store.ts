import { and, asc, eq, gt, inArray, lt, ne, notInArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { frameCapture, type FrameCaptureRecord } from "@/db/frame-capture-schema";
import { artifact } from "@/db/schema";
import { deleteObject, r2ConfigFromEnv } from "@/lib/files/r2";

import { captureLimits, captureObjectKeys, drawingKey, removalIsFinal, type CaptureDrawing } from "./capture-rules";

/**
 * Frame capture rows, and the one way a capture is deleted: its row is
 * marked removed, its objects are deleted from R2, and then the row goes. A
 * removal that stops halfway leaves a removed row, which the cleanup job
 * finishes. Nothing here logs an object key. Callers check who may do what.
 */

/** What a removal needs to know of a row. */
export type RemovedCapture = Pick<FrameCaptureRecord, "id" | "artifactId" | "partCount" | "startedAt">;

const removedColumns = { id: frameCapture.id, artifactId: frameCapture.artifactId, partCount: frameCapture.partCount, startedAt: frameCapture.startedAt };

function asRemoved(row: FrameCaptureRecord): RemovedCapture {
  return { id: row.id, artifactId: row.artifactId, partCount: row.partCount, startedAt: row.startedAt };
}

/** The most removed captures whose objects are deleted at once. */
const removalChunk = 10;

/** The most removals the needed-list call finishes itself. The cleanup job finishes the rest. */
export const inlineRemovals = 8;

/** The most removed captures one cleanup run finishes. The next run continues. */
export const sweepBatchSize = 200;

/** Marks the captures `where` matches as removed, in one statement. Returns the rows it marked. */
async function markRemoved(where: SQL | undefined): Promise<RemovedCapture[]> {
  const rows = await getDb().update(frameCapture).set({ status: "removed" }).where(and(where, ne(frameCapture.status, "removed"))).returning();
  return rows.map(asRemoved);
}

/** Deletes every part of one capture from R2. True when all of them went (a part that never arrived counts as gone). */
async function deleteParts(row: RemovedCapture): Promise<boolean> {
  const config = r2ConfigFromEnv();
  const results = await Promise.allSettled(captureObjectKeys(row.artifactId, row.id, row.partCount).map((key) => deleteObject(config, key)));
  return results.every((result) => result.status === "fulfilled");
}

/**
 * Finishes the removal of captures already marked removed: deletes their
 * objects, then the rows whose objects all went. A row younger than its
 * upload URLs stays for the cleanup job even then, since a part could still
 * arrive, and that job deletes the objects once more before the row goes.
 * A failure is logged by count, never by key, and never thrown: the row
 * stays removed, so the cleanup job tries again. Returns how many rows went.
 */
export async function finishRemovals(rows: readonly RemovedCapture[], now: Date = new Date()): Promise<number> {
  const done: string[] = [];
  let failed = 0;
  for (let start = 0; start < rows.length; start += removalChunk) {
    const chunk = rows.slice(start, start + removalChunk);
    const results = await Promise.allSettled(chunk.map((row) => deleteParts(row)));
    chunk.forEach((row, index) => {
      const result = results[index];
      if (result?.status !== "fulfilled" || !result.value) failed += 1;
      else if (removalIsFinal(row.startedAt, now)) done.push(row.id);
    });
  }
  if (failed > 0) console.error(`[captures] The images of ${String(failed)} removed frame captures could not be deleted; the cleanup job will retry.`);
  if (done.length === 0) return 0;
  const gone = await getDb().delete(frameCapture).where(and(inArray(frameCapture.id, done), eq(frameCapture.status, "removed"))).returning();
  return gone.length;
}

async function finishQuietly(rows: readonly RemovedCapture[], now: Date): Promise<void> {
  await finishRemovals(rows, now).catch((error: unknown) => {
    console.error("[captures] A removal was left for the cleanup job", error instanceof Error ? error.name : "unknown error");
  });
}

/** Removes one capture: for a drawing that failed its checks or is no longer wanted. */
export async function removeCapture(captureId: string, now: Date = new Date()): Promise<void> {
  await finishQuietly(await markRemoved(eq(frameCapture.id, captureId)), now);
}

/**
 * Removes every capture of an artifact, before the artifact itself is
 * deleted. If marking them fails, the cleanup job finds them by their
 * missing artifact.
 */
export async function removeArtifactCaptures(artifactId: string, now: Date = new Date()): Promise<void> {
  await finishQuietly(await markRemoved(eq(frameCapture.artifactId, artifactId)), now);
}

/**
 * Removes an artifact's captures of content that is no longer on its board:
 * every capture whose drawing is not in `current`. So the canvas's storage
 * cap counts only current images. Returns how many it marked.
 */
export async function removeStaleCaptures(artifactId: string, current: readonly CaptureDrawing[], now: Date = new Date()): Promise<number> {
  const keys = [...new Set(current.map(drawingKey))];
  const offBoard = keys.length === 0 ? undefined : notInArray(sql<string>`${frameCapture.frameHash} || ':' || ${frameCapture.mode}`, keys);
  const rows = await markRemoved(and(eq(frameCapture.artifactId, artifactId), offBoard));
  await finishQuietly(rows.slice(0, inlineRemovals), now);
  return rows.length;
}

/** What the needed list, the caps, and start read of a canvas's captures. */
export type LiveCapture = Pick<FrameCaptureRecord, "id" | "frameHash" | "mode" | "status" | "startedAt" | "bytes">;

/** An artifact's pending and ready captures. */
export async function listLiveCaptures(artifactId: string): Promise<LiveCapture[]> {
  return getDb()
    .select({ id: frameCapture.id, frameHash: frameCapture.frameHash, mode: frameCapture.mode, status: frameCapture.status, startedAt: frameCapture.startedAt, bytes: frameCapture.bytes })
    .from(frameCapture)
    .where(and(eq(frameCapture.artifactId, artifactId), ne(frameCapture.status, "removed")));
}

/** How many captures a person started within the last hour and has not finished. */
export async function countPendingCaptures(userId: string, now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - captureLimits.pendingTtlMs);
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(frameCapture)
    .where(and(eq(frameCapture.capturedBy, userId), eq(frameCapture.status, "pending"), gt(frameCapture.startedAt, since)));
  return row?.count ?? 0;
}

/** Stores a started capture. */
export async function insertPendingCapture(values: Omit<typeof frameCapture.$inferInsert, "status" | "startedAt" | "capturedAt">): Promise<void> {
  await getDb().insert(frameCapture).values({ ...values, status: "pending" });
}

/** A person's own capture while it is still pending, or null. */
export async function getOwnPendingCapture(captureId: string, userId: string): Promise<FrameCaptureRecord | null> {
  const [row] = await getDb()
    .select()
    .from(frameCapture)
    .where(and(eq(frameCapture.id, captureId), eq(frameCapture.capturedBy, userId), eq(frameCapture.status, "pending")))
    .limit(1);
  return row ?? null;
}

const readyRowSchema = z.object({ made: z.enum(["ready", "retired"]), id: z.string(), artifact_id: z.string(), part_count: z.coerce.number(), started_at: z.coerce.date() });

/** Postgres ended this statement to break a deadlock (40P01). Drivers and drizzle may wrap the error, so the causes are followed a few levels. */
function isDeadlock(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth += 1) {
    if ("code" in current && current.code === "40P01") return true;
    current = "cause" in current ? current.cause : null;
  }
  return false;
}

/**
 * The statement markCaptureReady runs. It first locks every live capture of
 * the content and mode, in id order, so two captures of one content that
 * finish at the same moment take the same locks in the same order: the
 * second waits for the first, then finds itself removed and changes nothing.
 */
function readyStatement(row: Pick<FrameCaptureRecord, "id" | "artifactId" | "frameHash" | "mode">) {
  return sql`
    with locked as (
      select ${frameCapture.id} from ${frameCapture}
      where ${frameCapture.artifactId} = ${row.artifactId} and ${frameCapture.frameHash} = ${row.frameHash} and ${frameCapture.mode} = ${row.mode}
        and ${frameCapture.status} <> 'removed'
      order by ${frameCapture.id}
      for update
    ), mine as (
      update ${frameCapture} set status = 'ready', captured_at = now()
      where ${frameCapture.id} = ${row.id} and ${frameCapture.status} = 'pending'
        and (select count(*) from locked) > 0
      returning ${frameCapture.id}, ${frameCapture.artifactId}, ${frameCapture.partCount}, ${frameCapture.startedAt}
    ), retired as (
      update ${frameCapture} set status = 'removed'
      where ${frameCapture.artifactId} = ${row.artifactId} and ${frameCapture.frameHash} = ${row.frameHash} and ${frameCapture.mode} = ${row.mode}
        and ${frameCapture.id} <> ${row.id} and ${frameCapture.status} <> 'removed'
        and exists (select 1 from mine)
      returning ${frameCapture.id}, ${frameCapture.artifactId}, ${frameCapture.partCount}, ${frameCapture.startedAt}
    )
    select 'ready' as made, id, artifact_id, part_count, started_at from mine
    union all
    select 'retired' as made, id, artifact_id, part_count, started_at from retired
  `;
}

/**
 * Makes a checked capture the current image of its content, in one
 * statement: the row turns ready only while it is still pending, and only
 * then every other capture of the same content and mode is marked removed.
 * So a canvas has at most one ready capture of a content, and a capture
 * that lost to another, or was removed meanwhile, changes nothing. Should
 * Postgres still end the statement to break a deadlock, it is tried once
 * more. Returns whether the capture is now ready.
 */
export async function markCaptureReady(row: Pick<FrameCaptureRecord, "id" | "artifactId" | "frameHash" | "mode">, now: Date = new Date()): Promise<boolean> {
  const run = async () => z.array(readyRowSchema).parse((await getDb().execute(readyStatement(row))).rows);
  const rows = await run().catch((error: unknown) => {
    if (isDeadlock(error)) return run();
    throw error;
  });
  const retired = rows.filter((made) => made.made === "retired").map((made) => ({ id: made.id, artifactId: made.artifact_id, partCount: made.part_count, startedAt: made.started_at }));
  await finishQuietly(retired, now);
  return rows.some((made) => made.made === "ready");
}

/** Marks captures whose artifact is gone as removed: a delete that could not mark them first, or a capture started as its artifact went. */
async function markOrphans(): Promise<void> {
  await getDb().execute(sql`
    update ${frameCapture} set status = 'removed'
    where ${frameCapture.status} <> 'removed'
      and not exists (select 1 from ${artifact} where ${artifact.id} = ${frameCapture.artifactId})
  `);
}

/**
 * The cleanup job's part: marks captures still pending after an hour and
 * captures whose artifact is gone as removed, then finishes removals whose
 * upload URLs have ended (those just marked, and any that stopped halfway
 * before). Returns how many rows went, and whether more wait.
 */
export async function sweepCaptures(now: Date = new Date()): Promise<{ removed: number; remaining: boolean }> {
  await markRemoved(and(eq(frameCapture.status, "pending"), lt(frameCapture.startedAt, new Date(now.getTime() - captureLimits.pendingTtlMs))));
  await markOrphans();
  const rows = await getDb()
    .select(removedColumns)
    .from(frameCapture)
    .where(and(eq(frameCapture.status, "removed"), lt(frameCapture.startedAt, new Date(now.getTime() - captureLimits.removalGraceMs))))
    .orderBy(asc(frameCapture.startedAt))
    .limit(sweepBatchSize);
  const removed = await finishRemovals(rows, now);
  return { removed, remaining: rows.length === sweepBatchSize };
}
