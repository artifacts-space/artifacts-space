"use server";

import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { getSession } from "@/lib/session";

import type { ConfirmationAction } from "./kinds";
import { resetConfirmations, skipConfirmation } from "./store";

const signedOut: ActionResult<never> = { success: false, error: "Sign in again to save this." };

/** Saves "Don't ask again" for one kind of confirmation. */
export async function skipConfirmationAction(action: unknown): Promise<ActionResult<ConfirmationAction>> {
  try {
    const session = await getSession();
    if (!session) return signedOut;
    const saved = await skipConfirmation(session.user.id, action);
    return { success: true, data: saved };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "Could not save that choice.") };
  }
}

/** Turns every confirmation back on for the signed-in person. */
export async function resetConfirmationsAction(): Promise<ActionResult<null>> {
  try {
    const session = await getSession();
    if (!session) return signedOut;
    await resetConfirmations(session.user.id);
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "Could not turn confirmations back on.") };
  }
}
