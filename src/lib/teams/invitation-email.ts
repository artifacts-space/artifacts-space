import { createHash } from "node:crypto";

import { APIError } from "better-auth/api";

import { reserveBudgetedEmail } from "@/lib/email/budget";
import { INVITATION_BUDGET_MESSAGE } from "@/lib/email/budget-rules";
import { html, renderEmail } from "@/lib/email/layout";
import { refuseUndeliverableAddress } from "@/lib/email/undeliverable-refusal";
import { isSendirConfigured, sendEmail } from "@/lib/sendir";
import { siteUrl } from "@/lib/site-origin";

interface TeamInvitationEmail {
  invitationId: string;
  email: string;
  teamName: string;
  inviterName: string;
  /** When the link stops working. A resend moves it, which gives the resent email its own idempotency key. */
  expiresAt: Date;
}

/**
 * One key per email sent: the invitation and its expiry. Sendir keeps a key
 * for good, so a key from the id alone would swallow every resend; a resend
 * moves the expiry, so it sends. A retry of the same send keeps the key.
 */
export function invitationIdempotencyKey(invitationId: string, expiresAt: Date) {
  return `team-invitation:${createHash("sha256").update(`${invitationId}:${expiresAt.toISOString()}`).digest("hex")}`;
}

/** The page where the invited person accepts or declines. Never built from the request. */
export function invitationUrl(invitationId: string) {
  return siteUrl(`/invitations/${encodeURIComponent(invitationId)}`);
}

/** The team invitation in the shared layout. Team and inviter names are escaped. */
export function renderTeamInvitationEmail(url: string, teamName: string, inviterName: string, email: string) {
  return renderEmail({
    title: `Join ${teamName} on artifacts.space`,
    preview: `${inviterName} invited you to the team. You can edit its artifacts as soon as you join.`,
    heading: html`Join ${teamName} on artifacts.space`,
    paragraphs: [
      html`${inviterName} invited you to the team. Join to read and edit the artifacts the team shares, with no approval needed inside the team.`,
      html`Sign in with ${email} to join. The invitation works only for this address, and it expires in 7 days.`,
    ],
    action: { label: "View invitation", url },
    note: html`If you did not expect this email, you can ignore it.`,
    reason: "You got this email because someone invited this address to a team on artifacts.space.",
    text: `${inviterName} invited you to join ${teamName} on artifacts.space. Join to read and edit the artifacts the team shares.\n\n${url}\n\nSign in with ${email} to join. The invitation works only for this address, and it expires in 7 days. If you did not expect this email, you can ignore it.`,
  });
}

/**
 * Sends a team invitation with Sendir. In local development without Sendir
 * keys, it prints the link to the server log instead. Each send uses one
 * email of the shared daily budget, so invitations can never use up the
 * quota sign-in links need; over budget it refuses with a message to show.
 * An address Sendir says cannot receive mail is refused with a 422 and the
 * `EMAIL_UNDELIVERABLE` code. Better Auth swallows what this throws, so the
 * teams plugin hands those refusals to the caller (invitation-send-refusal.ts).
 */
export async function sendTeamInvitationEmail(input: TeamInvitationEmail) {
  const url = invitationUrl(input.invitationId);
  if (!(await reserveBudgetedEmail("team-invitation"))) throw new APIError("TOO_MANY_REQUESTS", { message: INVITATION_BUDGET_MESSAGE });
  if (!isSendirConfigured()) {
    if (process.env.NODE_ENV === "production") throw new Error("Sendir is not configured, so invitations cannot be sent.");
    console.info(`[teams] Invitation to ${input.teamName} for ${input.email}: ${url}`);
    return;
  }

  const { error } = await sendEmail(
    {
      to: input.email,
      fromName: "artifacts.space",
      subject: `Join ${input.teamName} on artifacts.space`,
      ...renderTeamInvitationEmail(url, input.teamName, input.inviterName, input.email),
    },
    { idempotencyKey: invitationIdempotencyKey(input.invitationId, input.expiresAt) },
  );
  refuseUndeliverableAddress(error);
  if (error) throw new Error(`Sendir could not send the invitation: ${error.name} (${String(error.statusCode ?? "no answer")})`);
}
