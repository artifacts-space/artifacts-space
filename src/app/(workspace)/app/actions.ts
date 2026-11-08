"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { actionErrorMessage } from "@/lib/action-errors";
import { loadArtifactForViewer } from "@/lib/artifact-read";
import { getSession } from "@/lib/session";
import {
  createArtifact,
  deleteArtifact,
  listArtifacts,
  updateArtifact,
  type ArtifactUpdateInput,
} from "@/lib/artifacts";
import type {
  ActionResult,
  ArtifactDto,
  ArtifactInput,
  ArtifactListItemDto,
  SaveArtifactResult,
} from "@/lib/artifact-types";
import { StaleSaveError, type SaveOptions } from "@/lib/save-guard";
import { editSessionSteps } from "@/lib/versions/history-rules";
import { isPublicId } from "@/lib/public-id";
import { tagLimits } from "@/lib/tags/limits";
import { normalizeTag } from "@/lib/tags/rules";

const publicIdSchema = z.string().refine(isPublicId, "Artifact not found.");
const projectFilterSchema = z.union([z.object({ key: z.string().trim().min(1).max(240) }), z.object({ none: z.literal(true) })]);
const searchSchema = z.object({
  query: z.string().trim().min(1).max(300),
  teamId: z.string().trim().min(1).max(200).nullable(),
  project: projectFilterSchema.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(tagLimits.maxChars * 4)).max(tagLimits.maxPerArtifact).optional(),
});

/** Every web save names the version its draft is based on, so it can never overwrite a newer save. */
const saveOptionsSchema = z.object({
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  session: z.enum(editSessionSteps).optional(),
});

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

/** The newest version of an artifact the viewer may read, for a refused save; undefined when it cannot load. */
async function latestFor(publicId: string, userId: string): Promise<ArtifactDto | undefined> {
  try {
    const loaded = await loadArtifactForViewer(publicId, userId);
    return loaded?.dto;
  } catch {
    return undefined;
  }
}

/**
 * Saves changes to an artifact the person may edit. `options.expectedUpdatedAt`
 * is the version the editor's draft is based on: when someone else saved
 * since, nothing is written and the result carries their newest version.
 * `options.session` groups an editor's autosaves into one version.
 */
export async function updateArtifactAction(
  id: string,
  input: ArtifactUpdateInput,
  options: SaveOptions,
): Promise<SaveArtifactResult> {
  let userId: string | null = null;
  try {
    userId = await requireUserId();
    const updated = await updateArtifact(userId, id, input, "person", saveOptionsSchema.parse(options));
    if (!updated) return { success: false, error: "Artifact not found." };
    revalidatePath("/app");
    revalidatePath(`/artifact/${updated.publicId}`);
    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof StaleSaveError && userId) {
      const latest = await latestFor(error.publicId, userId);
      return latest ? { success: false, error: error.message, latest } : { success: false, error: error.message };
    }
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

/**
 * One artifact in full, for the workspace when a list item is opened. Lists
 * carry previews only. Same access check as every read; counts against the
 * per-user read limit.
 */
export async function loadArtifactAction(publicId: string): Promise<ActionResult<ArtifactDto>> {
  try {
    const userId = await requireUserId();
    const id = publicIdSchema.parse(publicId);
    await enforceRateLimit("readByUser", userId);
    const loaded = await loadArtifactForViewer(id, userId);
    if (!loaded) return { success: false, error: "Artifact not found." };
    return { success: true, data: loaded.dto };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The artifact could not be loaded. Please try again.") };
  }
}

/**
 * Searches titles, summaries, content, and project names on the server, in
 * the viewer's own artifacts or one team's (membership is checked in the
 * query), within the project filter when one is set.
 * The workspace list only holds previews, so content search happens here.
 */
export async function searchArtifactsAction(input: z.input<typeof searchSchema>): Promise<ActionResult<ArtifactListItemDto[]>> {
  try {
    const userId = await requireUserId();
    const { query, teamId, project, tags } = searchSchema.parse(input);
    await enforceRateLimit("readByUser", userId);
    const items = await listArtifacts(userId, { query, project: project ?? undefined, tags: tags?.map(normalizeTag), scope: teamId ? { kind: "team", teamId } : { kind: "mine" } });
    return { success: true, data: items };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "Search did not work. Please try again.") };
  }
}
