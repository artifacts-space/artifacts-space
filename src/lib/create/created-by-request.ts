import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact } from "@/db/schema";

/**
 * The id of the user's own artifact that a blank page's create already
 * stored, by its create id (webCreateSessionId), or null. Scoped to the
 * user, so a create id can never reach someone else's artifact.
 */
export async function artifactCreatedByRequest(userId: string, sessionId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ id: artifact.id })
    .from(artifact)
    .where(and(eq(artifact.userId, userId), eq(artifact.sessionId, sessionId)))
    .limit(1);
  return row?.id ?? null;
}
