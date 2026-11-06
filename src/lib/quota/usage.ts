import { sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { agent, artifact, artifactFile, artifactVersion } from "@/db/schema";
import { fileLimits } from "@/lib/files/config";
import { byteLength } from "@/lib/artifact-limits";
import { UserFacingError } from "@/lib/user-facing-error";

import { contentBytesAdded, contentQuotaProblem, fileQuotaProblem, quotaLimits } from "./rules";

/**
 * Storage use per account (a person plus the agents they own), summed on
 * demand. Both sums ride indexes that start with the user id, and
 * octet_length reads a stored value's size without decompressing it, so a
 * check costs one small query. No counters to drift.
 */

const currentLimits = () =>
  quotaLimits({ STORAGE_QUOTA_CONTENT_BYTES: process.env.STORAGE_QUOTA_CONTENT_BYTES, STORAGE_QUOTA_FILE_BYTES: process.env.STORAGE_QUOTA_FILE_BYTES });

const usageSchema = z.object({ bytes: z.coerce.number() });

/** SQL for the user ids in `userId`'s account: the owning person and every agent they own. */
function accountUserIds(userId: string) {
  return sql`(
    with account_owner as (select coalesce((select ${agent.ownerId} from ${agent} where ${agent.userId} = ${userId}), ${userId}) as id)
    select id from account_owner
    union
    select ${agent.userId} from ${agent} where ${agent.ownerId} = (select id from account_owner)
  )`;
}

async function sumBytes(query: ReturnType<typeof sql>): Promise<number> {
  const result = await getDb().execute(query);
  return usageSchema.parse(result.rows[0] ?? { bytes: 0 }).bytes;
}

/**
 * Bytes of artifact content in the account: the current content of every
 * artifact it authored, plus their saved versions (each version's `bytes`).
 */
export function contentBytesUsed(userId: string): Promise<number> {
  return sumBytes(sql`
    select
      coalesce((select sum(octet_length(${artifact.content})) from ${artifact} where ${artifact.userId} in ${accountUserIds(userId)}), 0)
      + coalesce((
        select sum(${artifactVersion.bytes}) from ${artifactVersion}
        join ${artifact} on ${artifact.id} = ${artifactVersion.artifactId}
        where ${artifact.userId} in ${accountUserIds(userId)}
      ), 0) as bytes
  `);
}

/** Bytes of files in the account: finished uploads, plus uploads started within the last hour (older pending ones are abandoned). */
export function fileBytesUsed(userId: string, now = new Date()): Promise<number> {
  const pendingSince = new Date(now.getTime() - fileLimits.pendingTtlMs).toISOString();
  return sumBytes(sql`
    select coalesce(sum(${artifactFile.size}), 0) as bytes from ${artifactFile}
    where ${artifactFile.uploaderId} in ${accountUserIds(userId)}
      and (${artifactFile.status} = 'ready' or ${artifactFile.createdAt} > ${pendingSince}::timestamptz)
  `);
}

/**
 * Throws a UserFacingError when saving `newContent` in place of
 * `previousContent` (empty for a new artifact) would put the account over
 * its content quota. Shrinking content is always allowed.
 */
export async function assertContentFits(userId: string, newContent: string, previousContent = ""): Promise<void> {
  const adding = contentBytesAdded(byteLength(newContent), byteLength(previousContent));
  if (adding <= 0) return;
  const problem = contentQuotaProblem({ used: await contentBytesUsed(userId), adding, limit: currentLimits().contentBytes });
  if (problem) throw new UserFacingError(problem);
}

/** Throws a UserFacingError when a new file of `size` bytes would put the account over its file quota. */
export async function assertFileFits(userId: string, size: number): Promise<void> {
  const problem = fileQuotaProblem({ used: await fileBytesUsed(userId), adding: size, limit: currentLimits().fileBytes });
  if (problem) throw new UserFacingError(problem);
}
