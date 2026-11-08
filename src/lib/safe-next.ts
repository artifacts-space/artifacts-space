const backslash = "\\";
/** A placeholder origin: a path that resolves away from it would leave this site. */
const siteOrigin = "https://site.invalid";

/** True when the browser would resolve `path` to a page on this site, after it strips tabs and newlines and reads backslashes as slashes. */
function staysOnSite(path: string): boolean {
  try {
    return new URL(path, siteOrigin).origin === siteOrigin;
  } catch {
    return false;
  }
}

/**
 * A `next` path from a query string, when it is a path on this site.
 * Anything else (another origin, a protocol-relative URL, a `javascript:`
 * URL) returns null.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next?.startsWith("/")) return null;
  if (next.startsWith("//") || next.startsWith(`/${backslash}`)) return null;
  if (!staysOnSite(next)) return null;
  return next;
}

/**
 * A link to `page` (such as `/sign-in`) that keeps the post-auth destination,
 * so switching between sign-up and sign-in still lands on `next`. An unsafe or
 * missing `next` is dropped.
 */
export function withNextPath(page: string, next: string | null | undefined): string {
  const safe = safeNextPath(next);
  if (!safe) return page;
  return `${page}?${new URLSearchParams({ next: safe }).toString()}`;
}
