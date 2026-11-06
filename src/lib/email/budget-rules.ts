/**
 * The daily email budget, as pure rules. Sendir caps the whole organization
 * at a number of recipients a day (it resets at midnight UTC). Sign-in links
 * must always get through, so every other email (team invitations, mention
 * emails, report emails) shares a smaller budget that stops well below the cap.
 */

/** Sendir's recipients-a-day cap for our organization. Raise it here when Sendir's /admin cap goes up. */
export const SENDIR_DAILY_RECIPIENTS = 200;

/** The share of the cap that emails other than sign-in links may use. The rest is headroom for sign-in. */
export const NON_SIGN_IN_SHARE = 0.6;

/** Emails that count against the shared budget. Sign-in links never do. */
export type BudgetedEmail = "team-invitation" | "mention" | "report";

/** How many non-sign-in emails may go out each UTC day. */
export function nonSignInDailyLimit(cap = SENDIR_DAILY_RECIPIENTS, share = NON_SIGN_IN_SHARE): number {
  return Math.max(0, Math.floor(cap * share));
}

const dayMs = 86_400_000;

/** Midnight UTC that starts the day containing `nowMs`. Sendir's cap resets then. */
export function utcDayStart(nowMs: number): Date {
  return new Date(Math.floor(nowMs / dayMs) * dayMs);
}

/**
 * Which budget this deployment counts against. Production and preview send
 * through the same Sendir organization, so they share one. Local development
 * shares the production database but prints emails instead of sending them,
 * so it gets its own count and never uses up production's.
 */
export function budgetScope(env: { VERCEL_ENV?: string | undefined }): "sendir" | "local" {
  return env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview" ? "sendir" : "local";
}

/** The refusal shown to a person whose invitation hit the daily budget. */
export const INVITATION_BUDGET_MESSAGE =
  "We have sent a lot of email today, so new invitations are paused until midnight UTC. Sign-in links still work. Try again tomorrow, or share the team link another way.";
