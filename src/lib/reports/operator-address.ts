import { z } from "zod";

/*
 * The site operator's address for report emails, from ABUSE_REPORT_EMAIL.
 * Kept out of rules.ts, which the report form also loads in the browser.
 */

/** Where report emails go: the site operator's address, or why there is none. */
export type OperatorAddress = { ok: true; email: string } | { ok: false; problem: "unset" | "invalid" };

const operatorEmailSchema = z.email();

/**
 * Reads ABUSE_REPORT_EMAIL, the site operator's address for report emails.
 * Empty or missing is "unset"; anything that is not one email address is
 * "invalid". Either way no email goes out, and the report is still stored.
 */
export function parseAbuseReportEmail(value: string | undefined): OperatorAddress {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return { ok: false, problem: "unset" };
  const parsed = operatorEmailSchema.safeParse(trimmed);
  return parsed.success ? { ok: true, email: parsed.data } : { ok: false, problem: "invalid" };
}
