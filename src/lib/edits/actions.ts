"use server";

import { z } from "zod";

import { hitRateLimit } from "@/lib/abuse/rate-limit";
import { getEditableArtifactMeta } from "@/lib/access";
import type { ActionResult } from "@/lib/artifact-types";
import { getSession } from "@/lib/session";

import { endEditLease, renewEditLease } from "./agent-write-guard";

const signalSchema = z.object({ artifactId: z.string().trim().min(1).max(200), editing: z.boolean() });

/**
 * The web editor's "I'm editing" signal (src/lib/edits): starts or renews the
 * signed-in person's edit lease on an artifact they may edit, so an agent
 * that names no base version cannot overwrite their typing for about a
 * minute. The editor sends it on input only, at most every 20 seconds, with
 * the artifact's id, and sends `editing: false` when it closes, which ends
 * the lease within one signal interval (endEditLease). The runaway limit
 * runs before the access check, which reads the row without its content.
 * Over the runaway limit the lease is simply left as it is and the answer is
 * still a success: the person's saves work, and their next save still wins
 * over agents' saves.
 */
export async function signalEditingAction(artifactId: string, editing = true): Promise<ActionResult<null>> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Your session ended. Sign in again." };
    const input = signalSchema.parse({ artifactId, editing });
    // The runaway limit comes first, so a flood of signals never reaches the artifact read.
    const limit = await hitRateLimit("editLease", session.user.id);
    if (!limit.allowed) return { success: true, data: null };
    const record = await getEditableArtifactMeta(session.user.id, input.artifactId);
    if (!record) return { success: false, error: "Artifact not found." };
    await (input.editing ? renewEditLease(record.id, session.user.id) : endEditLease(record.id, session.user.id));
    return { success: true, data: null };
  } catch (error) {
    if (!(error instanceof z.ZodError)) console.error("[edits] Editing signal failed", error instanceof Error ? error.name : "unknown error");
    return { success: false, error: "The editing signal did not go through." };
  }
}
