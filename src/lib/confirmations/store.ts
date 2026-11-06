import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { confirmationSkip } from "@/db/schema";

import { confirmationActionSchema, type ConfirmationAction } from "./kinds";

/**
 * The confirmations this person turned off. Rows for actions that no longer
 * exist are ignored.
 */
export async function listSkippedConfirmations(userId: string): Promise<ConfirmationAction[]> {
  const rows = await getDb()
    .select({ action: confirmationSkip.action })
    .from(confirmationSkip)
    .where(eq(confirmationSkip.userId, userId));
  const actions: ConfirmationAction[] = [];
  for (const row of rows) {
    const parsed = confirmationActionSchema.safeParse(row.action);
    if (parsed.success) actions.push(parsed.data);
  }
  return actions;
}

/** Turns off one kind of confirmation for this person. Saving it twice is harmless. */
export async function skipConfirmation(userId: string, action: unknown): Promise<ConfirmationAction> {
  const parsed = confirmationActionSchema.parse(action);
  await getDb().insert(confirmationSkip).values({ userId, action: parsed }).onConflictDoNothing();
  return parsed;
}

/** Turns every confirmation back on for this person. */
export async function resetConfirmations(userId: string): Promise<void> {
  await getDb().delete(confirmationSkip).where(eq(confirmationSkip.userId, userId));
}
