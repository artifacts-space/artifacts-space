import { isAPIError } from "better-auth/api";
import { ZodError } from "zod";

import { UserFacingError } from "@/lib/user-facing-error";

const organizationWord = /organization/gi;

/** Better Auth says "organization"; the product says "team". */
export function teamWording(message: string) {
  return message.replace(organizationWord, (word) => (word.startsWith("O") ? "Team" : "team"));
}

/**
 * A message that is safe to show for a failed server action. Better Auth and
 * our guards write plain, user-facing messages; anything else is generic.
 */
export function actionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ZodError) return error.issues[0]?.message ?? fallback;
  if (error instanceof UserFacingError) return error.message;
  if (isAPIError(error) && error.message) return teamWording(error.message);
  return fallback;
}
