"use server";

import { z } from "zod";

import { hitRateLimit } from "@/lib/abuse/rate-limit";
import { getEditableArtifact } from "@/lib/access";
import type { ActionResult } from "@/lib/artifact-types";
import { isPublicId } from "@/lib/public-id";
import { getSession } from "@/lib/session";

import { renewEditLease } from "./agent-write-guard";

const publicIdSchema = z.string().refine(isPublicId, "Artifact not found.");

/**
 * The web editor's "I'm editing" signal (src/lib/edits): starts or renews the
 * signed-in person's edit lease on an artifact they may edit, so an agent
 * that names no base version cannot overwrite their typing for about a
 * minute. The editor sends it on input only, at most every 20 seconds. Over
 * the runaway limit the signal is dropped quietly: saves still work, and the
 * person's next save still wins over agents.
 */
export async function signalEditingAction(publicId: string): Promise<ActionResult<null>> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Your session ended. Sign in again." };
    const id = publicIdSchema.parse(publicId);
    const record = await getEditableArtifact(session.user.id, { publicId: id });
    if (!record) return { success: false, error: "Artifact not found." };
    const limit = await hitRateLimit("editLease", session.user.id);
    if (!limit.allowed) return { success: false, error: "Too many signals." };
    await renewEditLease(record.id, session.user.id);
    return { success: true, data: null };
  } catch (error) {
    if (!(error instanceof z.ZodError)) console.error("[edits] Editing signal failed", error instanceof Error ? error.name : "unknown error");
    return { success: false, error: "The editing signal did not go through." };
  }
}
