import type { MetadataRoute } from "next";

import { docsHref, docsPages } from "@/lib/docs/pages";
import { siteOrigin } from "@/lib/site-origin";

/**
 * What crawlers and security researchers read about this site: robots.txt,
 * the sitemap, and /.well-known/security.txt. Pure, so the lists can be
 * tested; the route files in src/app only call these.
 */

/** The repository's GitHub URL, for the security contact and policy. */
const repository = "https://github.com/artifacts-space/artifacts-space";

/** Where security reports go first. The GitHub advisory form is the second contact. */
export const securityContactEmail = "security@artifacts.space";

/**
 * When security.txt stops being valid (RFC 9116 asks for less than a year).
 * Bump it, after checking the contact still works, before the test that
 * guards it starts failing 30 days ahead.
 */
export const securityTxtExpires = new Date("2027-11-01T00:00:00.000Z");

/**
 * Paths crawlers should not visit: the signed-in app, team pages, comment
 * threads, invitations, the API and OAuth endpoints, dev pages, and legacy
 * share redirects. Artifact pages are not listed: each one sets its own
 * robots meta (public artifacts may be indexed, all others are noindex), and
 * a crawler blocked here could not read that tag.
 */
export const crawlDisallowed = ["/app", "/inbox", "/teams", "/threads", "/invitations", "/api/", "/oauth/", "/dev/", "/preview", "/share/"] as const;

/** Public pages for the sitemap: the home page, the legal pages, and every docs page. Never artifacts. */
export function publicPaths(): string[] {
  return ["/", "/privacy", "/terms", ...docsPages.map((page) => docsHref(page.slug))];
}

/**
 * The origin for crawler files. They are built without secrets, so when the
 * deployment's origin is not set this falls back to local development
 * instead of failing the build, as the root layout's metadataBase does.
 */
export function crawlOrigin(env: NodeJS.ProcessEnv = process.env): string {
  try {
    return siteOrigin(env);
  } catch {
    return "http://localhost:3000";
  }
}

/** The robots.txt rules for a site at `origin`. */
export function robotsFor(origin: string): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...crawlDisallowed] },
    sitemap: `${origin}/sitemap.xml`,
  };
}

/** The sitemap entries for a site at `origin`. */
export function sitemapFor(origin: string): MetadataRoute.Sitemap {
  return publicPaths().map((path) => ({ url: new URL(path, origin).href }));
}

/** The /.well-known/security.txt body (RFC 9116) for a site at `origin`. */
export function securityTxtFor(origin: string, expires: Date = securityTxtExpires): string {
  // RFC 9116: list contacts in order of preference.
  return [
    `Contact: mailto:${securityContactEmail}`,
    `Contact: ${repository}/security/advisories/new`,
    `Expires: ${expires.toISOString()}`,
    `Policy: ${repository}/blob/main/SECURITY.md`,
    `Canonical: ${origin}/.well-known/security.txt`,
    "Preferred-Languages: en",
    "",
  ].join("\n");
}
