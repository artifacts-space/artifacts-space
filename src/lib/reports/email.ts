import { createHash } from "node:crypto";

import { isSendirConfigured, sendEmail } from "@/lib/sendir";
import { siteUrl } from "@/lib/site-origin";

interface ReportEmail {
  reportId: string;
  ownerId: string;
  ownerEmail: string;
  teamName: string;
  teamSlug: string;
  artifactTitle: string;
  publicId: string;
  reasonLabel: string;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function renderHtml(input: ReportEmail, teamUrl: string, artifactUrl: string) {
  const team = escapeHtml(input.teamName);
  const title = escapeHtml(input.artifactTitle);
  const reason = escapeHtml(input.reasonLabel);
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#18181b;background:#ffffff">
    <div style="max-width:440px;margin:0 auto">
      <p style="margin:0 0 24px;font-size:14px;font-weight:600">artifacts.space</p>
      <h1 style="margin:0 0 12px;font-size:20px;font-weight:500">A reader reported an artifact in ${team}</h1>
      <p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#52525b">Artifact: <a href="${escapeHtml(artifactUrl)}" style="color:#18181b">${title}</a></p>
      <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#52525b">Reason: ${reason}</p>
      <a href="${escapeHtml(teamUrl)}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#18181b;color:#ffffff;font-size:14px;text-decoration:none">Review the report</a>
      <p style="margin:32px 0 0;font-size:12px;line-height:18px;color:#71717a">You get this email because you own the team. On the team page you can withdraw sharing or dismiss the report.</p>
    </div>
  </body>
</html>`;
}

/**
 * Tells one team owner about a new report, with Sendir. In local development
 * without Sendir keys, it prints the links to the server log instead. Links
 * are absolute and built from siteUrl, never from the request.
 */
export async function sendReportEmail(input: ReportEmail) {
  const teamUrl = siteUrl(`/teams/${encodeURIComponent(input.teamSlug)}`);
  const artifactUrl = siteUrl(`/artifact/${encodeURIComponent(input.publicId)}`);
  if (!isSendirConfigured()) {
    if (process.env.NODE_ENV === "production") throw new Error("Sendir is not configured, so report emails cannot be sent.");
    console.info(`[reports] Report on ${artifactUrl} (${input.reasonLabel}) for ${input.ownerEmail}: ${teamUrl}`);
    return;
  }
  const { error } = await sendEmail(
    {
      to: input.ownerEmail,
      fromName: "artifacts.space",
      subject: `Report on “${input.artifactTitle}” in ${input.teamName}`,
      html: renderHtml(input, teamUrl, artifactUrl),
      text: `A reader reported an artifact in ${input.teamName}.\n\nArtifact: ${input.artifactTitle}\n${artifactUrl}\n\nReason: ${input.reasonLabel}\n\nReview the report: ${teamUrl}`,
    },
    { idempotencyKey: `artifact-report:${createHash("sha256").update(`${input.reportId}:${input.ownerId}`).digest("hex")}` },
  );
  if (error) throw new Error(`Sendir could not send the report email: ${error.name} (${String(error.statusCode ?? "no answer")})`);
}
