import { APIError } from "better-auth/api";

import { hitRateLimit, rateLimitMessage } from "@/lib/abuse/rate-limit";
import type { RateLimitName } from "@/lib/abuse/limits";
import { emailBudgetHasRoom } from "@/lib/email/budget";
import { INVITATION_BUDGET_MESSAGE } from "@/lib/email/budget-rules";

/** Refuses a new team (from our action or Better Auth's endpoint) when the person created many in the last hour. */
export async function assertCanCreateTeam(userId: string): Promise<void> {
  const decision = await hitRateLimit("teamCreate", userId);
  if (!decision.allowed) throw new APIError("TOO_MANY_REQUESTS", { message: rateLimitMessage("teamCreate", decision.retryAfterSeconds) });
}

/** The invitation limits, in the order they are checked. */
export function invitationLimitChecks(inviterId: string, teamId: string): { name: RateLimitName; subject: string }[] {
  return [
    { name: "teamInviteByUserHour", subject: inviterId },
    { name: "teamInviteByUserDay", subject: inviterId },
    { name: "teamInviteByTeamDay", subject: teamId },
  ];
}

/**
 * Refuses (with a message safe to show) when the inviter or the team sent
 * many invitations, or when today's shared email budget is used up, so
 * nothing is stored or sent that cannot be emailed. Every invitation email
 * passes it once: a new invitation through Better Auth's
 * beforeCreateInvitation hook, before the row is stored, and a resend in
 * inviteMemberAction, because Better Auth's resend path skips that hook.
 * Better Auth's invite-member HTTP route is closed (teamRoutesClosedOverHttp),
 * so the action is the only way in.
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
