import { z } from "zod";

import { reportReasons, type ArtifactVisibility, type ReportReason } from "@/lib/artifact-types";

/** Labels for the report form and the team page, in the order the form lists them. */
export const reportReasonLabels: Record<ReportReason, string> = {
  spam: "Spam or advertising",
  phishing: "Phishing or a scam",
  malware: "Malware or harmful code",
  harassment: "Harassment or hate",
  illegal: "Illegal content",
  private_info: "Someone's private information",
  copyright: "Copyright infringement",
  other: "Something else",
};

export const REPORT_DETAILS_MAX_LENGTH = 1000;

/** What a reader sends. Details are optional. */
export const reportInputSchema = z.object({
  reason: z.enum(reportReasons, { error: "Choose a reason for the report." }),
  details: z
    .string()
    .trim()
    .max(REPORT_DETAILS_MAX_LENGTH, `Keep the details to ${String(REPORT_DETAILS_MAX_LENGTH)} characters or fewer.`)
    .optional()
    .default(""),
});

export type ReportInput = z.output<typeof reportInputSchema>;

/** Checks a report. Returns the cleaned input, or the first problem in words. */
export function parseReportInput(input: unknown): { ok: true; data: ReportInput } | { ok: false; error: string } {
  const parsed = reportInputSchema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the report and try again." };
}

/** Only artifacts readable outside a team (link and public) can be reported. */
export function isReportable(visibility: ArtifactVisibility): boolean {
  return visibility === "link" || visibility === "public";
}
