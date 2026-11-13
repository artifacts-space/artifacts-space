import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { localDatabaseEnabled, localDatabaseSkipReason } from "./local-db";

/**
 * Database helpers for the Inbox checks: comments that mention someone, as
 * the app stores them. Local throwaway database only, like local-db.ts.
 */

let pool: Pool | null = null;

function db(): Pool {
  if (!localDatabaseEnabled()) throw new Error(localDatabaseSkipReason);
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

/** The words an inline comment sits on, with the text around them. */
export interface TestQuote {
  quote: string;
  prefix: string;
  suffix: string;
}

/**
 * Stores a comment on an artifact, `seconds` ago so the thread keeps the
 * order given, and returns its id. A `quote` makes it an inline comment.
 */
export async function insertComment(input: { publicId: string; authorId: string; body: string; seconds: number; parentId?: string; quote?: TestQuote }): Promise<string> {
  const id = randomUUID();
  await db().query(
    `insert into comment (id, artifact_id, author_id, parent_id, body, quote, quote_prefix, quote_suffix, created_at, updated_at)
     select $1, id, $2, $3, $4, $5, $6, $7, now() - make_interval(secs => $8), now() - make_interval(secs => $8) from artifact where public_id = $9`,
    [id, input.authorId, input.parentId ?? null, input.body, input.quote?.quote ?? null, input.quote?.prefix ?? null, input.quote?.suffix ?? null, input.seconds, input.publicId],
  );
  return id;
}

/** Puts an unread mention of `recipientId` in a comment into their Inbox. */
export async function mention(commentId: string, recipientId: string): Promise<void> {
  await db().query(
    `insert into mention (id, comment_id, artifact_id, recipient_id) select $1, id, artifact_id, $3 from comment where id = $2`,
    [randomUUID(), commentId, recipientId],
  );
}

/** Whether the recipient's mention in a comment is read. */
export async function mentionRead(commentId: string, recipientId: string): Promise<boolean> {
  const result = await db().query<{ read: boolean }>(`select read_at is not null as read from mention where comment_id = $1 and recipient_id = $2`, [commentId, recipientId]);
  return result.rows[0]?.read ?? false;
}

/** Deletes a comment the way the app does: it keeps its place with no text. */
export async function softDeleteComment(commentId: string): Promise<void> {
  await db().query(`update comment set body = '', quote = null, quote_prefix = null, quote_suffix = null, deleted_at = now() where id = $1`, [commentId]);
}

/** Resolves a thread by its first comment. */
export async function resolveThread(commentId: string, by: string): Promise<void> {
  await db().query(`update comment set resolved_at = now(), resolved_by = $2 where id = $1`, [commentId, by]);
}

/** Closes this file's connections. */
export async function closeInboxDb(): Promise<void> {
  await pool?.end();
  pool = null;
}
