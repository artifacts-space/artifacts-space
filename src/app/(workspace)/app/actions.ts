"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";

import { getSession } from "@/lib/session";
import {
  createArtifact,
  deleteArtifact,
  updateArtifact,
  type ArtifactUpdateInput,
} from "@/lib/artifacts";
import type {
  ActionResult,
  ArtifactDto,
  ArtifactInput,
  ArtifactVisibility,
} from "@/lib/artifact-types";

async function requireUserId() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user.id;
}

function errorMessage(error: unknown) {
  if (error instanceof ZodError) return error.issues[0]?.message ?? "Invalid artifact.";
  return "The artifact could not be saved. Please try again.";
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

export async function updateArtifactAction(
  id: string,
  input: ArtifactUpdateInput,
): Promise<ActionResult<ArtifactDto>> {
  try {
    const userId = await requireUserId();
    const updated = await updateArtifact(userId, id, input);
    if (!updated) return { success: false, error: "Artifact not found." };
    revalidatePath("/app");
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

export async function setArtifactVisibilityAction(
  id: string,
  visibility: ArtifactVisibility,
): Promise<ActionResult<ArtifactDto>> {
  return updateArtifactAction(id, { visibility });
}
