"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getEditableArtifact } from "@/lib/access";
import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult, ArtifactDto, VersionDetailDto, VersionSummaryDto } from "@/lib/artifact-types";
import { resolveThemeFor } from "@/lib/themes/artifact-theme-context";
import { restoreArtifactVersion } from "@/lib/artifacts";
import { isPublicId } from "@/lib/public-id";
import { getSession } from "@/lib/session";
import { UserFacingError } from "@/lib/user-facing-error";

import { getArtifactVersionDetail, listArtifactVersions } from "./history-queries";

/**
 * History for the web app: list versions, open one, and restore one. Only
 * people who may edit the artifact get anything back; everyone else gets the
 * same "not found".
 */

const publicIdSchema = z.string().refine(isPublicId, "Artifact not found.");
const versionIdSchema = z.uuid("That version is not in the history.");
const expectedSchema = z.iso.datetime({ offset: true }).optional();

async function run<T>(fallback: string, action: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Your session ended. Sign in again." };
    return { success: true, data: await action(session.user.id) };
  } catch (error) {
    if (!(error instanceof UserFacingError) && !(error instanceof z.ZodError)) {
      console.error("[versions] Action failed", error instanceof Error ? error.name : "unknown error");
    }
    return { success: false, error: actionErrorMessage(error, fallback) };
  }
}

async function editable(userId: string, publicId: unknown) {
  const record = await getEditableArtifact(userId, { publicId: publicIdSchema.parse(publicId) });
  if (!record) throw new UserFacingError("Artifact not found.");
  return record;
}

/** The artifact's versions, newest first, for someone who may edit it. */
export async function listVersionsAction(publicId: string): Promise<ActionResult<VersionSummaryDto[]>> {
  return run("The history could not load. Try again.", async (userId) => listArtifactVersions(await editable(userId, publicId)));
}

/** One version with its content, for someone who may edit the artifact. */
export async function getVersionAction(publicId: string, versionId: string): Promise<ActionResult<VersionDetailDto>> {
  return run("The version could not load. Try again.", async (userId) => {
    const record = await editable(userId, publicId);
    const detail = await getArtifactVersionDetail(record, versionIdSchema.parse(versionId));
    if (!detail) throw new UserFacingError("That version is no longer in the history.");
    const { theme } = await resolveThemeFor(record, detail.theme);
    return { ...detail, renderTheme: theme };
  });
}

/**
 * Restores a version as a new save. `expectedUpdatedAt` is the artifact's
 * updatedAt the person saw; a newer save by someone else refuses the restore.
 */
export async function restoreVersionAction(publicId: string, versionId: string, expectedUpdatedAt?: string): Promise<ActionResult<ArtifactDto>> {
  return run("The version could not be restored. Try again.", async (userId) => {
    const record = await editable(userId, publicId);
    const options = { expectedUpdatedAt: expectedSchema.parse(expectedUpdatedAt) };
    const restored = await restoreArtifactVersion(userId, record.id, versionIdSchema.parse(versionId), "person", options);
    if (!restored) throw new UserFacingError("Artifact not found.");
    revalidatePath("/app");
    revalidatePath(`/artifact/${record.publicId}`);
    return restored;
  });
}
