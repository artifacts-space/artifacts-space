import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { artifact } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import type { ArtifactDto } from "@/lib/artifact-types";
import { dtoFor } from "@/lib/sharing/requests";
import { UserFacingError } from "@/lib/user-facing-error";

import { canChangeShowInSearch, showInSearchProblem, type SearchActor } from "./search-rules";

/*
 * Turns "Show in search engines" on or off. Only the artifact's author, in
 * the web app, may change it (canChangeShowInSearch); it can be turned on
 * only while the artifact is public. Everyone else gets "not found", so the
 * answer never tells whether an artifact exists.
 */

const inputSchema = z.object({ actorId: z.string().min(1), artifactId: z.string().min(1).max(200), on: z.boolean() });

const notFoundMessage = "Artifact not found. Only its author can change whether it shows in search engines.";

/**
 * Sets the artifact's "Show in search engines" setting and returns its DTO.
 * The write repeats the author and public checks in its WHERE clause, so a
 * sharing change racing this one can never leave a non-public artifact on.
 */
export async function setShowInSearch(input: { actorId: string; artifactId: string; on: boolean; actor: SearchActor }): Promise<ArtifactDto> {
  const { actorId, artifactId, on } = inputSchema.parse(input);
  const [record] = await getDb()
    .select({ userId: artifact.userId, visibility: artifact.visibility })
    .from(artifact)
    .where(eq(artifact.id, artifactId))
    .limit(1);
  if (!record || !canChangeShowInSearch({ actorId, authorId: record.userId, actor: input.actor })) throw new UserFacingError(notFoundMessage);
  const problem = on ? showInSearchProblem(record.visibility) : null;
  if (problem) throw new UserFacingError(problem);
  await enforceRateLimit("sharingRequest", actorId);

  const stillAllowed = on ? and(eq(artifact.userId, actorId), eq(artifact.visibility, "public")) : eq(artifact.userId, actorId);
  const [updated] = await getDb()
    .update(artifact)
    .set({ showInSearch: on })
    .where(and(eq(artifact.id, artifactId), stillAllowed))
    .returning();
  if (!updated) throw new UserFacingError(on ? "The artifact is no longer public. Make it public first." : notFoundMessage);
  return dtoFor(artifactId, actorId);
}
