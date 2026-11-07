/**
 * Pure routing rules for the Markdown version of an artifact page. A request
 * for /artifact/<id>.md, or for /artifact/<id> with an Accept header that
 * prefers text/markdown over HTML, is rewritten by src/proxy.ts to the
 * Markdown route handler. Browsers never send text/markdown, so they keep
 * getting the page.
 */

const artifactPath = /^\/artifact\/([^/]+)\/?$/;
const markdownSuffix = ".md";
const markdownTypes = new Set(["text/markdown", "text/x-markdown"]);
const htmlTypes = new Set(["text/html", "application/xhtml+xml"]);

/** A request for the Markdown version: the artifact's public id, and how it was asked for. */
export interface MarkdownRequest {
  publicId: string;
  via: "suffix" | "accept";
}

interface MediaRange {
  type: string;
  quality: number;
}

function parseRange(part: string): MediaRange | null {
  const [rawType, ...params] = part.split(";");
  const type = rawType?.trim().toLowerCase();
  if (!type) return null;
  const q = params.map((param) => param.trim().toLowerCase()).find((param) => param.startsWith("q="));
  const quality = q ? Number(q.slice(2)) : 1;
  return { type, quality: Number.isFinite(quality) ? quality : 0 };
}

function bestQuality(ranges: readonly MediaRange[], types: ReadonlySet<string>): number {
  return ranges.reduce((best, range) => (types.has(range.type) ? Math.max(best, range.quality) : best), 0);
}

/**
 * Whether an Accept header asks for Markdown: it names text/markdown with a
 * quality above zero, at least as high as any HTML type it names. Wildcards
 * never count, so browsers and plain `curl` get HTML.
 */
export function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  const ranges = accept.split(",").flatMap((part) => parseRange(part) ?? []);
  const markdown = bestQuality(ranges, markdownTypes);
  return markdown > 0 && markdown >= bestQuality(ranges, htmlTypes);
}

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/**
 * The Markdown request a page load asks for, or null for the normal page.
 * Only GET and HEAD on /artifact/<id> count. A ".md" suffix is stripped from
 * the id; the handler then checks the id like the page does.
 */
export function markdownRequestFor(method: string, pathname: string, accept: string | null): MarkdownRequest | null {
  if (method !== "GET" && method !== "HEAD") return null;
  const segment = artifactPath.exec(pathname)?.[1];
  const decoded = segment ? decodeSegment(segment) : null;
  if (!decoded) return null;
  if (decoded.endsWith(markdownSuffix)) return { publicId: decoded.slice(0, -markdownSuffix.length), via: "suffix" };
  return prefersMarkdown(accept) ? { publicId: decoded, via: "accept" } : null;
}

/** The internal route the proxy rewrites a Markdown request to. The query string (such as ?comments=1) is kept. */
export function markdownRoutePath(publicId: string): string {
  return `/artifact/${encodeURIComponent(publicId || "-")}/markdown`;
}
