"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { actionErrorMessage } from "@/lib/action-errors";
import { getSession } from "@/lib/session";
import {
  createArtifact,
  deleteArtifact,
  updateArtifact,
  type ArtifactUpdateInput,
  type SaveOptions,
} from "@/lib/artifacts";
import type {
  ActionResult,
  ArtifactDto,
  ArtifactInput,
} from "@/lib/artifact-types";

const expectedSchema = z.iso.datetime({ offset: true }).optional();

async function requireUserId() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user.id;
}

function errorMessage(error: unknown) {
  return actionErrorMessage(error, "The artifact could not be saved. Please try again.");
}

export async function createArtifactAction(
  input: ArtifactInput,
): Promise<ActionResult<ArtifactDto>> {
  try {
    const userId = await requireUserId();
    const created = await createArtifact(userId, { ...input, source: input.source || "web" });
    revalidatePath("/app");
    return { success: true, data: created };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

/**
 * Saves changes to an artifact the person may edit. `options.expectedUpdatedAt`
 * refuses the save when someone else saved since the editor opened it.
 */
export async function updateArtifactAction(
  id: string,
  input: ArtifactUpdateInput,
  options: SaveOptions = {},
): Promise<ActionResult<ArtifactDto>> {
  try {
    const userId = await requireUserId();
    const updated = await updateArtifact(userId, id, input, "person", { expectedUpdatedAt: expectedSchema.parse(options.expectedUpdatedAt) });
    if (!updated) return { success: false, error: "Artifact not found." };
    revalidatePath("/app");
    revalidatePath(`/artifact/${updated.publicId}`);
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function deleteArtifactAction(id: string): Promise<ActionResult<string>> {
  try {
    const userId = await requireUserId();
    const deleted = await deleteArtifact(userId, id);
    if (!deleted) return { success: false, error: "Artifact not found." };
    revalidatePath("/app");
    return { success: true, data: id };
  } catch {
    return { success: false, error: "The artifact could not be deleted." };
  }
}
