import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { getEditableArtifactMeta } from "@/lib/access";

import { artifactHarnessOf } from "./harness-rules";
import type { HarnessId } from "./harnesses";

/** The harness as saved, with the public id for the caller to refresh its page. */
export interface SavedArtifactHarness {
  publicId: string;
  harness: ReturnType<typeof artifactHarnessOf>;
}

/**
 * Sets (or clears, with null) the harness one artifact shows, for when it
 * was detected wrong. Anyone who may edit the artifact can: its author, the
 * person who added the agent that wrote it, and its team. Like Full width it
 * is a label, not content: no version, no approval, and the save time and
 * last editor stay as they are. Returns undefined when the editor may not
 * edit it (callers answer "not found"). Counts against the edit limit.
 */
export async function setArtifactHarnessOverride(editorId: string, artifactId: string, harness: HarnessId | null): Promise<SavedArtifactHarness | undefined> {
  // Without content: a label change never needs it.
  const record = await getEditableArtifactMeta(editorId, artifactId);
  if (!record) return undefined;
  await enforceRateLimit("harnessChoice", editorId);
  if (record.harnessOverride !== harness) {
    await getDb().update(artifact).set({ harnessOverride: harness }).where(eq(artifact.id, record.id));
  }
  return { publicId: record.publicId, harness: artifactHarnessOf({ harness: record.harness, harnessOverride: harness }) };
}
