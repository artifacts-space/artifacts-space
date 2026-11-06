import { APIError } from "better-auth/api";

import { hitRateLimit, rateLimitMessage } from "@/lib/abuse/rate-limit";
import type { RateLimitName } from "@/lib/abuse/limits";
import { emailBudgetHasRoom } from "@/lib/email/budget";
import { INVITATION_BUDGET_MESSAGE } from "@/lib/email/budget-rules";

/** The invitation limits, in the order they are checked. */
export function invitationLimitChecks(inviterId: string, teamId: string): { name: RateLimitName; subject: string }[] {
  return [
    { name: "teamInviteByUserHour", subject: inviterId },
    { name: "teamInviteByUserDay", subject: inviterId },
    { name: "teamInviteByTeamDay", subject: teamId },
  ];
}

/**
 * Runs before Better Auth stores a new invitation, from our server action or
 * its HTTP endpoint. Refuses (with a message safe to show) when the inviter
 * or the team sent many invitations, or when today's shared email budget is
 * used up, so nothing is stored that cannot be emailed.
 */
export async function assertCanInvite(inviterId: string, teamId: string): Promise<void> {
  if (!(await emailBudgetHasRoom())) {
    console.error("[teams] An invitation was refused: the daily email budget is used up.");
    throw new APIError("TOO_MANY_REQUESTS", { message: INVITATION_BUDGET_MESSAGE });
  }
  for (const check of invitationLimitChecks(inviterId, teamId)) {
    const decision = await hitRateLimit(check.name, check.subject);
    if (!decision.allowed) throw new APIError("TOO_MANY_REQUESTS", { message: rateLimitMessage(check.name, decision.retryAfterSeconds) });
  }
}
