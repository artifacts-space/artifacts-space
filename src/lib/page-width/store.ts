import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { getEditableArtifact } from "@/lib/access";

/**
 * Writes the per-artifact "Full width" setting. It is a display setting,
 * like the project and tags: anyone who may edit the artifact changes it at
 * once, with no version in History, no approval, and the save time and
 * last editor kept as they are.
 */

/** The setting as saved, with the public id for the caller to refresh its page. */
export interface SavedFullWidth {
  publicId: string;
  fullWidth: boolean;
}

/**
 * Sets whether the artifact shows full width. Returns the saved setting, or
 * undefined when the editor may not edit it (callers answer "not found").
 * Counts against the artifact edit limit; never files a version.
 */
export async function setArtifactFullWidth(editorId: string, artifactId: string, fullWidth: boolean): Promise<SavedFullWidth | undefined> {
  const record = await getEditableArtifact(editorId, { id: artifactId });
  if (!record) return undefined;
  await enforceRateLimit("artifactUpdate", editorId);
  if (record.fullWidth !== fullWidth) {
    await getDb().update(artifact).set({ fullWidth }).where(eq(artifact.id, record.id));
  }
  return { publicId: record.publicId, fullWidth };
}
