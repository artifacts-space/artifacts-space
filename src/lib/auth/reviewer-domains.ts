/**
 * The email domains a password account may use (connector directory
 * reviewers; password-sign-in-rules.ts). One list for the owner's script,
 * which refuses any other address, and for the sign-in page, which offers a
 * password field only once someone types an address under one of them. Pure
 * and without imports, so scripts can load it directly.
 */

/** Domains reviewer accounts use in production: the site's own, only. */
export const reviewerEmailDomains: readonly string[] = ["artifacts.space"];

/**
 * The reserved test domain. It counts as a reviewer domain only outside
 * production builds (browser) and only for a database on this machine
 * (script), so local tests can use it and production never does.
 */
export const testReviewerEmailDomain = "example.com";

/**
 * True outside production builds. Next inlines NODE_ENV at build time, so a
 * production bundle never accepts the test domain.
 */
export const testDomainAllowedInThisBuild = process.env.NODE_ENV !== "production";

/** The lowercased domain of an address, or null when it has none. */
export function emailDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 1 || at === trimmed.length - 1) return null;
  return trimmed.slice(at + 1);
}

/**
 * True when the address is under a reviewer domain: exactly the domain, never
 * a subdomain or a look-alike. Decided from the typed text alone, with no
 * request and no account lookup, so it says nothing about who has an account.
 */
export function isReviewerDomainEmail(email: string, allowTestDomain: boolean): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  if (reviewerEmailDomains.includes(domain)) return true;
  return allowTestDomain && domain === testReviewerEmailDomain;
}
