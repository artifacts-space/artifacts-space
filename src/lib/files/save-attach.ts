import type { ArtifactRecord } from "@/db/schema";

import { checkContentFiles } from "./attach";
import { checkCoverFile } from "./cover-file";
import { checkIconFile } from "./icon-file";
import { attachFileRows } from "./store";

/** The uploads a save will attach: the media its content names, and its icon and cover images. */
export interface SaveFiles {
  contentFileIds: string[];
  imageFileIds: string[];
}

/**
 * Checks the files an update's content, icon, and cover point at, and
 * returns them without attaching anything. The save attaches them only after
 * its guarded write lands (attachContentAndImageFiles), so a refused save
 * leaves every upload as it was.
 */
export async function checkUpdatedContentFiles(userId: string, current: Pick<ArtifactRecord, "id" | "kind" | "content">, update: { kind?: string | undefined; content?: string | undefined; icon?: string | null | undefined; cover?: string | null | undefined }): Promise<SaveFiles> {
  const imageFileIds = [...(await checkIconFile(userId, current.id, update.icon)), ...(await checkCoverFile(userId, current.id, update.cover))];
  const contentChanged = update.kind !== undefined || update.content !== undefined;
  const contentFileIds = contentChanged ? await checkContentFiles(userId, current.id, update.kind ?? current.kind, update.content ?? current.content) : [];
  return { contentFileIds, imageFileIds };
}

/** Attaches a save's uploads: the ones its content names as content media first, then its icon and cover images as plain files. */
export async function attachContentAndImageFiles(userId: string, artifactId: string, contentFileIds: readonly string[], imageFileIds: readonly string[]) {
  await attachFileRows(userId, artifactId, contentFileIds, { byContent: true });
  await attachFileRows(userId, artifactId, imageFileIds);
}
