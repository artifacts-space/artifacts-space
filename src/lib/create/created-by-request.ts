import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact } from "@/db/schema";

/** A create whose create id this user already stored: the caller hands back the stored artifact. */
export class CreateRequestTaken extends Error {
  constructor() {
    super("This create was already stored.");
    this.name = "CreateRequestTaken";
  }
}

/**
 * The lookup for the user's own artifact stored under a blank page's create
 * id. Scoped to the user, so a create id can never reach someone else's
 * artifact; exported so a test can check the generated SQL keeps that scope.
 */
export function createdByRequestQuery(db: Pick<ReturnType<typeof getDb>, "select">, userId: string, requestId: string) {
  return db
    .select({ id: artifact.id })
    .from(artifact)
    .where(and(eq(artifact.userId, userId), eq(artifact.createRequestId, requestId)))
    .limit(1);
}

/** The id of the user's own artifact a blank page's create already stored, by its create id, or null. */
export async function artifactCreatedByRequest(userId: string, requestId: string): Promise<string | null> {
  const [row] = await createdByRequestQuery(getDb(), userId, requestId);
  return row?.id ?? null;
}
