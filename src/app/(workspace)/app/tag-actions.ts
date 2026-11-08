"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { tagLimits } from "@/lib/tags/limits";
import type { TagFacet } from "@/lib/tags/queries";
import { listArtifactTagSuggestions, setArtifactTags } from "@/lib/tags/store";
import { getSession } from "@/lib/session";
import { UserFacingError } from "@/lib/user-facing-error";

/**
 * Server actions for tags. Both need edit access to the artifact. Changing
 * tags files no version and never waits for approval.
 */

const idSchema = z.string().trim().min(1).max(200);
const tagsSchema = z.array(z.string().max(tagLimits.maxChars * 4)).max(tagLimits.maxPerArtifact * 4);
const changeSchema = z.object({ add: tagsSchema, remove: tagsSchema });

const notFound = "Artifact not found, or you cannot edit it.";

async function requireUserId() {
  const session = await getSession();
  if (!session) throw new UserFacingError("Your session ended. Sign in again.");
  return session.user.id;
}

/** The tags an artifact's home scope uses, for suggestions. Editors only. */
export async function listArtifactTagSuggestionsAction(artifactId: string): Promise<ActionResult<TagFacet[]>> {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("readByUser", userId);
    const suggestions = await listArtifactTagSuggestions(userId, idSchema.parse(artifactId));
    if (!suggestions) return { success: false, error: notFound };
    return { success: true, data: suggestions };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "Tags did not load. Try again.") };
  }
}

/**
 * Adds and removes some of an artifact's tags, keeping the rest as they are
 * now (so tags an agent added meanwhile stay). Returns all its tags as saved.
 */
export async function changeArtifactTagsAction(artifactId: string, change: { add: string[]; remove: string[] }): Promise<ActionResult<string[]>> {
  try {
    const userId = await requireUserId();
    const saved = await setArtifactTags(userId, idSchema.parse(artifactId), changeSchema.parse(change));
    if (saved === undefined) return { success: false, error: notFound };
    revalidatePath("/app");
    return { success: true, data: saved };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The tags did not change. Try again.") };
  }
}
