import { networkKey } from "@/lib/abuse/network-key";
import { hitRateLimits } from "@/lib/abuse/rate-limit";
import { tooManyRequests } from "@/lib/abuse/responses";
import { findEditableCopy } from "@/lib/files/copies";
import { signedFileUrl } from "@/lib/files/download";
import { fileRequestLimits } from "@/lib/files/download-limit-rules";
import { resolveRequestViewer, viewerUserId } from "@/lib/request-viewer";
import { noindexHeader, robotsHeaderName } from "@/lib/search/search-rules";

/**
 * Headers on every answer. An old copy is for people who can edit the
 * artifact, so even the redirect is never cached: someone who loses edit
 * access loses the copy at once. Never indexed.
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

async function viewerId(request: Request) {
  try {
    return viewerUserId(await resolveRequestViewer(request));
  } catch {
    return null;
  }
}

/** The same per-network view limit as /api/files, keyed on the copy. Fails open, so a counter outage never hides a copy from its editors. */
async function overLimit(request: Request, copyId: string) {
  try {
    return await hitRateLimits(fileRequestLimits(request.headers.get("range"), networkKey(request.headers), copyId));
  } catch (error) {
    console.error("[files] Rate limit check failed", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}

/**
 * Opens or downloads an old copy of a replaced file, from History. Only
 * people who may edit the artifact get a 302 to a short-lived R2 link;
 * everyone else, and every unknown id, gets the same uncached 404.
 * `?download=1` forces a download.
 */
export async function GET(request: Request, context: RouteContext<"/api/files/[id]/copies/[copyId]">) {
  const { id, copyId } = await context.params;
  const refusal = await overLimit(request, copyId);
  if (refusal) return tooManyRequests(refusal, baseHeaders);
  try {
    const copy = await findEditableCopy(id, copyId, await viewerId(request));
    if (!copy) return notFound();
    const download = new URL(request.url).searchParams.get("download") === "1";
    const { url } = await signedFileUrl(copy, { download });
    return new Response(null, { status: 302, headers: { ...baseHeaders, Location: url } });
  } catch (error) {
    console.error("[files] Old copy download failed", error instanceof Error ? error.name : "unknown error");
    return new Response("The file could not be loaded. Try again.", { status: 500, headers: { ...baseHeaders, "Content-Type": "text/plain; charset=utf-8" } });
  }
}
