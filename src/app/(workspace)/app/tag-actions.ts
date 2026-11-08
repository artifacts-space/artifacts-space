"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

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
    const suggestions = await listArtifactTagSuggestions(userId, idSchema.parse(artifactId));
    if (!suggestions) return { success: false, error: notFound };
    return { success: true, data: suggestions };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "Tags did not load. Try again.") };
  }
}

/** Replaces an artifact's tags. Returns them as saved: normalized, without repeats. */
export async function setArtifactTagsAction(artifactId: string, tags: string[]): Promise<ActionResult<string[]>> {
  try {
    const userId = await requireUserId();
    const saved = await setArtifactTags(userId, idSchema.parse(artifactId), { set: tagsSchema.parse(tags) });
    if (saved === undefined) return { success: false, error: notFound };
    revalidatePath("/app");
    return { success: true, data: saved };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The tags did not change. Try again.") };
  }
}
