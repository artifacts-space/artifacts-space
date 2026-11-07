import { and, eq, inArray, like } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, artifactVersion } from "@/db/schema";
import { FILE_PREFIX, iconFileId } from "@/lib/artifact-icons";
import { protectedVersions } from "@/lib/versions/history";

import { unusedIconFiles } from "./icon-cleanup-rules";
import { getFileRows, removeFiles } from "./store";

/**
 * Deletes old icon images an artifact no longer uses, so replacing or
 * removing an image icon does not leave files behind. Candidates are images
 * any version of the artifact showed as its icon, plus `alsoCheck` (the icon
 * before a save, which a merged version may no longer show). While an edit
 * waits for approval the approved version is protected, so its icon stays
 * until the edit is approved; approval calls this again. Returns how many
 * files went. Only files attached to this artifact are ever removed.
 */
export async function pruneUnusedIconFiles(artifactId: string, alsoCheck: readonly (string | null)[] = []): Promise<number> {
  const [record] = await getDb()
    .select({ icon: artifact.icon, kind: artifact.kind, content: artifact.content, approvedVersionId: artifact.approvedVersionId })
    .from(artifact)
    .where(eq(artifact.id, artifactId))
    .limit(1);
  if (!record) return 0;
  const [iconRows, { pinned }] = await Promise.all([
    getDb()
      .selectDistinct({ icon: artifactVersion.icon })
      .from(artifactVersion)
      .where(and(eq(artifactVersion.artifactId, artifactId), like(artifactVersion.icon, `${FILE_PREFIX}%`))),
    protectedVersions(artifactId, record.approvedVersionId),
  ]);
  const candidates = [...iconRows.map((row) => row.icon), ...alsoCheck].flatMap((icon) => {
    const fileId = iconFileId(icon);
    return fileId ? [fileId] : [];
  });
  if (candidates.length === 0) return 0;
  const protectedStates = pinned.size === 0 ? [] : await getDb()
    .select({ icon: artifactVersion.icon, kind: artifactVersion.kind, content: artifactVersion.content })
    .from(artifactVersion)
    .where(inArray(artifactVersion.id, [...pinned]));
  const unused = unusedIconFiles(candidates, record, protectedStates);
  if (unused.length === 0) return 0;
  const rows = (await getFileRows(unused)).filter((row) => row.artifactId === artifactId);
  return (await removeFiles(rows)).length;
}

/** pruneUnusedIconFiles as housekeeping: a failure is logged, never thrown, and the save stands. */
export async function pruneUnusedIconFilesQuietly(artifactId: string, alsoCheck: readonly (string | null)[] = []): Promise<void> {
  await pruneUnusedIconFiles(artifactId, alsoCheck).catch((error: unknown) => {
    console.error("[files] Removing an unused icon image failed", error instanceof Error ? error.name : "unknown error");
  });
}
