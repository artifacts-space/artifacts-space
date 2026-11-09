import { createHash } from "node:crypto";

import { reserveBudgetedEmail } from "@/lib/email/budget";
import { emailLink, html, renderEmail, type SafeHtml } from "@/lib/email/layout";
import { isSendirConfigured, sendEmail } from "@/lib/sendir";
import { siteUrl } from "@/lib/site-origin";

interface ReportEmail {
  reportId: string;
  /** The site operator's address, from ABUSE_REPORT_EMAIL. */
  operatorEmail: string;
  /** The team the report landed with, or null when there is none. */
  team: { name: string; slug: string } | null;
  artifactTitle: string;
  publicId: string;
  reasonLabel: string;
  /** What the reader wrote. May be empty. */
  details: string;
}

interface ReportEmailContent {
  reportId: string;
  team: ReportEmail["team"];
  artifactTitle: string;
  reasonLabel: string;
  details: string;
  artifactUrl: string;
}

/** The report email to the site operator, in the shared layout. Every value from users is escaped. */
export function renderReportEmail({ reportId, team, artifactTitle, reasonLabel, details, artifactUrl }: ReportEmailContent) {
  const teamLabel = team ? `${team.name} (${team.slug})` : "None";
  const paragraphs: SafeHtml[] = [html`Artifact: ${emailLink(artifactUrl, artifactTitle)}`, html`Team: ${teamLabel}`, html`Reason: ${reasonLabel}`];
  if (details) paragraphs.push(html`Details from the reader: ${details}`);
  const detailsText = details ? `\nDetails from the reader: ${details}\n` : "";
  return renderEmail({
    title: "A reader reported an artifact",
    preview: `Reason: ${reasonLabel}`,
    heading: html`A reader reported an artifact`,
    paragraphs,
    action: { label: "Open the artifact", url: artifactUrl },
    note: team ? html`Report ${reportId}. The team's owners and admins also see it on their team page.` : html`Report ${reportId}.`,
    reason: "You get this email because this address receives abuse reports for this site.",
    text: `A reader reported an artifact.\n\nArtifact: ${artifactTitle}\n${artifactUrl}\n\nTeam: ${teamLabel}\nReason: ${reasonLabel}\n${detailsText}\nReport ${reportId}`,
  });
}

/**
 * Tells the site operator about a new report, with Sendir. In local
 * development without Sendir keys, it prints the report to the server log
 * instead. Links are absolute and built from siteUrl, never from the request.
 * Over the shared daily email budget the email is skipped (and logged); the
 * report is already stored.
 */
export async function sendReportEmail(input: ReportEmail) {
  const artifactUrl = siteUrl(`/artifact/${encodeURIComponent(input.publicId)}`);
  if (!(await reserveBudgetedEmail("report"))) return;
  if (!isSendirConfigured()) {
    if (process.env.NODE_ENV === "production") throw new Error("Sendir is not configured, so report emails cannot be sent.");
    console.info(`[reports] Report ${input.reportId} on ${artifactUrl} (${input.reasonLabel}) for the site operator.`);
    return;
  }
  const { error } = await sendEmail(
    {
      to: input.operatorEmail,
      fromName: "artifacts.space",
      subject: `Report on “${input.artifactTitle}”`,
      ...renderReportEmail({ ...input, artifactUrl }),
    },
    { idempotencyKey: `artifact-report:${createHash("sha256").update(input.reportId).digest("hex")}` },
  );
  if (error) throw new Error(`Sendir could not send the report email: ${error.name} (${String(error.statusCode ?? "no answer")})`);
}
