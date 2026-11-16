"use server";

import { z } from "zod";

import { hitRateLimit } from "@/lib/abuse/rate-limit";
import { getEditableArtifact, getEditableArtifactMeta } from "@/lib/access";
import type { ActionResult, ArtifactDto } from "@/lib/artifact-types";
import { toArtifactDtos } from "@/lib/artifacts";
import { getSession } from "@/lib/session";

import { lastSavedBy } from "./agent-write-guard";
import type { ChangedBy } from "./edit-conflict-rules";

const catchUpSchema = z.object({ artifactId: z.string().trim().min(1).max(200), knownUpdatedAt: z.iso.datetime() });

/** A newer save of an artifact the person has open, and who made it. */
export interface NewerArtifact {
  artifact: ArtifactDto;
  changedBy: ChangedBy | null;
}

/**
 * The newest save of an artifact the signed-in person may edit, when it is
 * newer than the one their editor shows (`knownUpdatedAt`); null when the
 * editor is current. An open canvas or interface asks when its tab comes
 * back (src/lib/edits/catch-up-rules.ts).
 *
 * The runaway limit comes first. Then the access check reads the row without
 * its content, and the content is read only when the artifact moved on, with
 * the same check every editor load uses (getEditableArtifact). So the answer
 * is always the latest version, which only people who may edit ever see: a
 * reader of the approved version gets "not found" here. Over the limit the
 * answer is "nothing newer".
 */
export async function catchUpAction(artifactId: string, knownUpdatedAt: string): Promise<ActionResult<NewerArtifact | null>> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Your session ended. Sign in again." };
    const input = catchUpSchema.parse({ artifactId, knownUpdatedAt });
    const limit = await hitRateLimit("catchUp", session.user.id);
    if (!limit.allowed) return { success: true, data: null };
    const meta = await getEditableArtifactMeta(session.user.id, input.artifactId);
    if (!meta) return { success: false, error: "Artifact not found." };
    if (meta.updatedAt.getTime() <= new Date(input.knownUpdatedAt).getTime()) return { success: true, data: null };
    const record = await getEditableArtifact(session.user.id, { id: meta.id });
    if (!record) return { success: false, error: "Artifact not found." };
    const [[artifact], changedBy] = await Promise.all([toArtifactDtos([record], session.user.id), lastSavedBy(record.id)]);
    if (!artifact) return { success: false, error: "Artifact not found." };
    return { success: true, data: { artifact, changedBy } };
  } catch (error) {
    if (!(error instanceof z.ZodError)) console.error("[edits] Catch-up check failed", error instanceof Error ? error.name : "unknown error");
    return { success: false, error: "The check for changes did not go through." };
  }
}
