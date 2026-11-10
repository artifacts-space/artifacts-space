import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { getEditableArtifactMeta } from "@/lib/access";

import { readSheetFormat, sameSheetFormat, type SheetFormat, storedSheetFormat } from "./rules";

/**
 * Writes a CSV artifact's sheet formatting (banding and column alignment).
 * Like "Full width", it is a display setting: anyone who may edit the
 * artifact changes it at once, with no version in History, no approval, and
 * the save time and last editor kept as they are. Readers only see it.
 *
 * Each save writes the whole formatting, and the last write wins: two
 * people changing the same sheet at the same moment keep whichever save
 * lands last, as with "Full width". That is deliberate for a small display
 * setting; the client sends one save at a time, so a person never races
 * themselves (src/lib/sheet-format/save-queue.ts).
 */

/** The formatting as saved, with the public id for the caller to refresh its page. */
export interface SavedSheetFormat {
  publicId: string;
  format: SheetFormat;
}

/**
 * Saves the formatting, already validated by sheetFormatSchema. Returns the
 * saved formatting, or undefined when the editor may not edit the artifact
 * or it is not a CSV (callers answer "not found"). Counts against the
 * artifact edit limit; never files a version. Reads only the artifact's
 * metadata (getEditableArtifactMeta), never its content.
 */
export async function setSheetFormat(editorId: string, artifactId: string, format: SheetFormat): Promise<SavedSheetFormat | undefined> {
  const record = await getEditableArtifactMeta(editorId, artifactId);
  if (record?.kind !== "csv") return undefined;
  await enforceRateLimit("artifactUpdate", editorId);
  const stored = storedSheetFormat(format);
  if (!sameSheetFormat(readSheetFormat(record.sheetFormat), format)) {
    await getDb().update(artifact).set({ sheetFormat: stored }).where(eq(artifact.id, record.id));
  }
  return { publicId: record.publicId, format: stored ?? readSheetFormat(null) };
}
