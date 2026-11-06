/** Protocols a link in artifact content may use. Everything else is dropped. */
const allowedProtocols = new Set(["http:", "https:", "mailto:"]);

/** `rel` for every link that leaves the page from artifact content. */
export const externalLinkRel = "noopener noreferrer nofollow ugc";

/** Longest URL a link may carry. */
export const maxHrefLength = 2000;

// Tabs and newlines, which URL parsers remove anywhere in a URL.
const strippedCharacters = /[\t\n\r]/g;

/**
 * Returns a normalized URL when `href` is an absolute http, https, or mailto
 * link, and null for anything else (javascript:, data:, relative paths, junk).
 */
export function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const trimmed = href.trim();
  if (!trimmed || trimmed.length > maxHrefLength) return null;
  // Browsers ignore embedded tabs and newlines, so "java\tscript:" must not slip through.
  const compact = trimmed.replace(strippedCharacters, "");
  let url: URL;
  try {
    url = new URL(compact);
  } catch {
    return null;
  }
  if (!allowedProtocols.has(url.protocol)) return null;
  if (url.protocol !== "mailto:" && !url.hostname) return null;
  if (url.username || url.password) return null;
  return url.href;
}

/** True when `href` passes the link policy. */
export function isSafeHref(href: unknown): boolean {
  return safeHref(href) !== null;
}
