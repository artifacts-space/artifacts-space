import type { ArtifactRecord } from "@/db/schema";

import { checkContentFiles } from "./attach";
import { checkCoverFile } from "./cover-file";
import { checkIconFile } from "./icon-file";
import { attachFileRows } from "./store";

/**
 * Checks and attaches the files an update's content and icon point at, before the
 * row changes, so a version saved with the edit already includes them.
 */
export async function attachUpdatedContentFiles(userId: string, current: Pick<ArtifactRecord, "id" | "kind" | "content">, update: { kind?: string | undefined; content?: string | undefined; icon?: string | null | undefined; cover?: string | null | undefined }) {
  const iconFileIds = [...(await checkIconFile(userId, current.id, update.icon)), ...(await checkCoverFile(userId, current.id, update.cover))];
  const contentChanged = update.kind !== undefined || update.content !== undefined;
  const contentFileIds = contentChanged ? await checkContentFiles(userId, current.id, update.kind ?? current.kind, update.content ?? current.content) : [];
  await attachContentAndImageFiles(userId, current.id, contentFileIds, iconFileIds);
}

/** Attaches a save's uploads: the ones its content names as content media first, then its icon and cover images as plain files. */
export async function attachContentAndImageFiles(userId: string, artifactId: string, contentFileIds: readonly string[], imageFileIds: readonly string[]) {
  await attachFileRows(userId, artifactId, contentFileIds, { byContent: true });
  await attachFileRows(userId, artifactId, imageFileIds);
}
