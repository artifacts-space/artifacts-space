/*
 * Who runs artifacts.space and how to reach them. The Privacy Policy, the
 * Terms, and the site footer all read these values, so the owner changes a
 * mailbox or the address here, in one place.
 */

/** The company that operates the hosted service, with its postal and email contacts. */
export const legalContact = {
  operator: "Webrenew LLC",
  operatorDescription: "a South Carolina limited liability company",
  street: "6651 Rivers Ave",
  city: "North Charleston, SC 29406",
  country: "United States",
  /** Privacy questions and requests to see, correct, or delete personal data. */
  privacyEmail: "privacy@artifacts.space",
  /** The Terms, notices, and copyright (DMCA) notices and counter-notices. */
  legalEmail: "legal@artifacts.space",
} as const;

/** When both documents took effect and last changed. */
export const legalDates = {
  effective: { label: "November 7, 2026", iso: "2026-11-07" },
  updated: { label: "November 11, 2026", iso: "2026-11-11" },
} as const;

/** The year in the footer's copyright line. */
export const COPYRIGHT_YEAR = 2026;

/** Webrenew's site, linked from the footer credit. */
export const WEBRENEW_URL = "https://webrenew.com";

/** Where the two documents live. */
export const legalPaths = { privacy: "/privacy", terms: "/terms" } as const;

/** The operator's postal address on one line. */
export function postalAddress(): string {
  return `${legalContact.street}, ${legalContact.city}`;
}

/** A mailto: link for one of the contact addresses, with an optional subject. */
export function mailtoHref(address: string, subject?: string): string {
  return subject ? `mailto:${address}?subject=${encodeURIComponent(subject)}` : `mailto:${address}`;
}
