import { createHash } from "node:crypto";

import { reserveBudgetedEmail } from "@/lib/email/budget";
import { emailLink, html, renderEmail } from "@/lib/email/layout";
import { isSendirConfigured, sendEmail } from "@/lib/sendir";
import { siteUrl } from "@/lib/site-origin";
import { teamTabHref } from "@/lib/teams/team-tabs-rules";

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

interface ReportEmailContent {
  teamName: string;
  artifactTitle: string;
  reasonLabel: string;
  teamUrl: string;
  artifactUrl: string;
}

/** The report email in the shared layout. Team name, artifact title, and reason are escaped. */
export function renderReportEmail({ teamName, artifactTitle, reasonLabel, teamUrl, artifactUrl }: ReportEmailContent) {
  return renderEmail({
    title: `A reader reported an artifact in ${teamName}`,
    preview: `Reason: ${reasonLabel}`,
    heading: html`A reader reported an artifact in ${teamName}`,
    paragraphs: [html`Artifact: ${emailLink(artifactUrl, artifactTitle)}`, html`Reason: ${reasonLabel}`],
    action: { label: "Review the report", url: teamUrl },
    note: html`On the team page you can withdraw sharing or dismiss the report.`,
    reason: "You get this email because you own the team.",
    text: `A reader reported an artifact in ${teamName}.\n\nArtifact: ${artifactTitle}\n${artifactUrl}\n\nReason: ${reasonLabel}\n\nReview the report: ${teamUrl}`,
  });
}

/**
 * Tells one team owner about a new report, with Sendir. In local development
 * without Sendir keys, it prints the links to the server log instead. Links
 * are absolute and built from siteUrl, never from the request. Over the
 * shared daily email budget the email is skipped (and logged); the report
 * still waits on the team page.
 */
export async function sendReportEmail(input: ReportEmail) {
  const teamUrl = siteUrl(teamTabHref(input.teamSlug, "artifacts", "reports"));
  const artifactUrl = siteUrl(`/artifact/${encodeURIComponent(input.publicId)}`);
  if (!(await reserveBudgetedEmail("report"))) return;
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
      ...renderReportEmail({ ...input, teamUrl, artifactUrl }),
    },
    { idempotencyKey: `artifact-report:${createHash("sha256").update(`${input.reportId}:${input.ownerId}`).digest("hex")}` },
  );
  if (error) throw new Error(`Sendir could not send the report email: ${error.name} (${String(error.statusCode ?? "no answer")})`);
}
