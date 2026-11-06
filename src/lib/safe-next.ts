const backslash = "\\";

/**
 * A `next` path from a query string, when it is a path on this site.
 * Anything else (another origin, a protocol-relative URL) returns null.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next?.startsWith("/")) return null;
  if (next.startsWith("//") || next.startsWith(`/${backslash}`)) return null;
  return next;
}
