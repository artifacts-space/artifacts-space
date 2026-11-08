import { sql } from "drizzle-orm";

import { artifact } from "@/db/schema";
import { UserFacingError } from "@/lib/user-facing-error";
import type { EditSessionStep } from "@/lib/versions/history-rules";

/**
 * The base-version check every web save runs. An editor sends the
 * `updatedAt` of the version its draft started from; the update only matches
 * while the row still has it, so a save never overwrites someone else's newer
 * save. The check and the write are one statement.
 */

/** Options for one save. */
export interface SaveOptions {
  /**
   * The artifact's `updatedAt` (ISO) of the version the editor's draft is
   * based on. When someone else saved since, the save is refused instead of
   * overwriting their work.
   */
  expectedUpdatedAt?: string | undefined;
  /** For a web editor autosave: where it sits in its editing session. One session files one version. */
  session?: EditSessionStep | undefined;
}

/** The message when a save would overwrite someone else's newer save. */
export const STALE_SAVE_MESSAGE = "Someone saved a newer version while you were editing, so your change was not saved.";

/** A save refused because the artifact changed since the editor's base version. */
export class StaleSaveError extends UserFacingError {
  /** The artifact the save was for, so the caller can hand back its newest version. */
  readonly publicId: string;

  constructor(publicId: string) {
    super(STALE_SAVE_MESSAGE);
    this.name = "StaleSaveError";
    this.publicId = publicId;
  }
}

/** The SQL condition for "the row still has the editor's base version", or undefined when no base was sent. */
export function unchangedSince(expectedUpdatedAt: string | undefined, publicId: string) {
  if (!expectedUpdatedAt) return undefined;
  const expected = new Date(expectedUpdatedAt);
  if (Number.isNaN(expected.getTime())) throw new StaleSaveError(publicId);
  // Postgres keeps microseconds; the browser saw milliseconds.
  return sql`date_trunc('milliseconds', ${artifact.updatedAt}) = ${expected.toISOString()}::timestamptz`;
}
