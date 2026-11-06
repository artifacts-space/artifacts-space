import { createHash } from "node:crypto";

import { isSendirConfigured, sendEmail } from "@/lib/sendir";
import { siteUrl } from "@/lib/site-origin";

interface TeamInvitationEmail {
  invitationId: string;
  email: string;
  teamName: string;
  inviterName: string;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** The page where the invited person accepts or declines. Never built from the request. */
export function invitationUrl(invitationId: string) {
  return siteUrl(`/invitations/${encodeURIComponent(invitationId)}`);
}

function renderHtml(url: string, teamName: string, inviterName: string) {
  const href = escapeHtml(url);
  const team = escapeHtml(teamName);
  const inviter = escapeHtml(inviterName);
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#18181b;background:#ffffff">
    <div style="max-width:440px;margin:0 auto">
      <p style="margin:0 0 24px;font-size:14px;font-weight:600">artifacts.space</p>
      <h1 style="margin:0 0 12px;font-size:20px;font-weight:500">Join ${team} on artifacts.space</h1>
      <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#52525b">${inviter} invited you to the team. Join to read the artifacts the team shares. The invitation expires in 7 days.</p>
      <a href="${href}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#18181b;color:#ffffff;font-size:14px;text-decoration:none">View invitation</a>
      <p style="margin:32px 0 0;font-size:12px;line-height:18px;color:#71717a">If you did not expect this email, you can ignore it.</p>
    </div>
  </body>
</html>`;
}

/**
 * Sends a team invitation with Sendir. In local development without Sendir
 * keys, it prints the link to the server log instead.
 */
export async function sendTeamInvitationEmail(input: TeamInvitationEmail) {
  const url = invitationUrl(input.invitationId);
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
      html: renderHtml(url, input.teamName, input.inviterName),
      text: `${input.inviterName} invited you to join ${input.teamName} on artifacts.space.\n\n${url}\n\nThe invitation expires in 7 days. If you did not expect this email, you can ignore it.`,
    },
    { idempotencyKey: `team-invitation:${createHash("sha256").update(input.invitationId).digest("hex")}` },
  );
  if (error) throw new Error(`Sendir could not send the invitation: ${error.name} (${String(error.statusCode ?? "no answer")})`);
}
