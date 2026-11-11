import type { ArtifactRecord } from "@/db/schema";

import { checkContentFiles } from "./attach";
import { checkCoverFile } from "./cover-file";
import { checkIconFile } from "./icon-file";
import type { SaveFiles } from "./save-statement";

export { writeAndAttach, type SaveFiles } from "./save-statement";

/**
 * Checks the files an update's content, icon, and cover point at, and
 * returns them without attaching anything. The save attaches them in the
 * same statement as its guarded write (writeAndAttach), so a refused save
 * leaves every upload as it was and a landed one never names an upload it
 * did not attach.
 */
export async function checkUpdatedContentFiles(userId: string, current: Pick<ArtifactRecord, "id" | "kind" | "content">, update: { kind?: string | undefined; content?: string | undefined; icon?: string | null | undefined; cover?: string | null | undefined }): Promise<SaveFiles> {
  const imageFileIds = [...(await checkIconFile(userId, current.id, update.icon)), ...(await checkCoverFile(userId, current.id, update.cover))];
  const contentChanged = update.kind !== undefined || update.content !== undefined;
  const contentFileIds = contentChanged ? await checkContentFiles(userId, current.id, update.kind ?? current.kind, update.content ?? current.content) : [];
  return { contentFileIds, imageFileIds };
}

