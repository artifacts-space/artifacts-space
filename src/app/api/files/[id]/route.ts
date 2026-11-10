import { networkKey } from "@/lib/abuse/network-key";
import { hitRateLimits } from "@/lib/abuse/rate-limit";
import { tooManyRequests } from "@/lib/abuse/responses";
import { findReadableFile, signedFileUrl } from "@/lib/files/download";
import { fileRequestLimits } from "@/lib/files/download-limit-rules";
import { fileRedirectCacheHeaders } from "@/lib/files/redirect-cache-rules";
import { noindexHeader, robotsHeaderName } from "@/lib/search/search-rules";
import { resolveRequestViewer, viewerUserId } from "@/lib/request-viewer";

/**
 * Headers on every answer from this route. R2 serves the bytes; these cover what we send. Files are never indexed.
 * Refusals and errors are never cached; only the redirect is, briefly (redirect-cache-rules.ts).
 */
const baseHeaders = {
  "Cache-Control": "private, no-store",
  [robotsHeaderName]: noindexHeader,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function notFound() {
  return new Response("Not found", { status: 404, headers: { ...baseHeaders, "Content-Type": "text/plain; charset=utf-8" } });
}

/** The session's user, or the bearer token's (as MCP checks it), so agents can follow file links from the Markdown version. */
async function viewerId(request: Request) {
  try {
    return viewerUserId(await resolveRequestViewer(request));
  } catch {
    return null;
  }
}

/** The per-network limit on file views, or the playback limits for seeks (fileRequestLimits). Fails open, so a counter outage never hides files. */
async function overLimit(request: Request, fileId: string) {
  try {
    return await hitRateLimits(fileRequestLimits(request.headers.get("range"), networkKey(request.headers), fileId));
  } catch (error) {
    console.error("[files] Rate limit check failed", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}

/**
 * Shows or downloads a file. Views are limited per network address (429 with Retry-After), and video and audio seeks have their own budget. Access goes through the file's artifact: whoever
 * can view the artifact (signed in, or with an access token) gets a 302 to a short-lived R2 link, which only their
 * browser may keep for a few minutes; everyone else, and every unknown id, gets the same uncached 404. `?download=1`
 * forces a download.
 */
export async function GET(request: Request, context: RouteContext<"/api/files/[id]">) {
  const { id } = await context.params;
  const refusal = await overLimit(request, id);
  if (refusal) return tooManyRequests(refusal, baseHeaders);
  try {
    const file = await findReadableFile(id, await viewerId(request));
    if (!file) return notFound();
    const download = new URL(request.url).searchParams.get("download") === "1";
    const { url } = await signedFileUrl(file, { download });
    return new Response(null, { status: 302, headers: { ...baseHeaders, ...fileRedirectCacheHeaders, Location: url } });
  } catch (error) {
    console.error("[files] Download failed", error instanceof Error ? error.name : "unknown error");
    return new Response("The file could not be loaded. Try again.", { status: 500, headers: { ...baseHeaders, "Content-Type": "text/plain; charset=utf-8" } });
  }
}
