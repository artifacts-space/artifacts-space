import { isAPIError } from "better-auth/api";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";

import { UserFacingError } from "@/lib/user-facing-error";

const organizationWord = /organization/gi;

/** Better Auth says "organization"; the product says "team". */
export function teamWording(message: string) {
  return message.replace(organizationWord, (word) => (word.startsWith("O") ? "Team" : "team"));
}

const lastOwnerMessage = "A team always keeps at least one owner.";

/**
 * Whether the database refused a change because it would leave a team with
 * no owner (the team_member_keeps_an_owner trigger). Drivers and Better Auth
 * may wrap the database error, so the causes are followed a few levels.
 */
function isLastOwnerRefusal(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if (current.message.includes(lastOwnerMessage)) return true;
    current = current.cause;
  }
  return false;
}

/**
 * A message that is safe to show for a failed server action. Better Auth and
 * our guards write plain, user-facing messages; anything else is generic.
 */
export function actionErrorMessage(error: unknown, fallback: string) {
  // A redirect or notFound() thrown inside the action is Next's control flow, never a failure to show.
  unstable_rethrow(error);
  if (error instanceof ZodError) return error.issues[0]?.message ?? fallback;
  if (error instanceof UserFacingError) return error.personMessage ?? error.message;
  if (isLastOwnerRefusal(error)) return lastOwnerMessage;
  if (isAPIError(error) && error.message) return teamWording(error.message);
  return fallback;
}
