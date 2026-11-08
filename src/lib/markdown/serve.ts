import { getSessionCookie } from "better-auth/cookies";

import { networkKey } from "@/lib/abuse/network-key";
import { hitRateLimits, type RateLimitCheck } from "@/lib/abuse/rate-limit";
import { tooManyRequests } from "@/lib/abuse/responses";
import { getViewableArtifact, type ViewableArtifact } from "@/lib/access";
import { bearerToken } from "@/lib/mcp/authenticate";
import { resolveRequestViewer, viewerUserId, type RequestViewer } from "@/lib/request-viewer";
import { noindexHeader } from "@/lib/search/search-rules";

import { artifactToMarkdown, notFoundMarkdown } from "./artifact-markdown";
import { loadMarkdownInput } from "./load";

/*
 * The Markdown (and raw) versions of an artifact, for agents that read a
 * link without MCP. Reads go through the one access check, with the session
 * cookie or a bearer token. Every refusal is the same Markdown 404, so a
 * private artifact's existence never leaks. Limits match the share page:
 * the same per-network budget, plus the MCP read budget for token reads.
 */

/** The share page's cache policy on Vercel: shared caches revalidate every time. */
const publicCache = "public, max-age=0, must-revalidate";
const privateCache = "private, no-store";

/** Whether the request carries credentials, so its answer may differ per viewer and must never be shared. */
function hasCredentials(request: Request): boolean {
  return bearerToken(request.headers.get("authorization")) !== null || getSessionCookie(request.headers) !== null;
}

/**
 * Headers on every answer: never mixed with the HTML page in a cache, and
 * never indexed, even when the page is (it would repeat the page).
 */
export function markdownHeaders(credentialed: boolean, contentType = "text/markdown; charset=utf-8"): Record<string, string> {
  return {
    "Content-Type": contentType,
    "Cache-Control": credentialed ? privateCache : publicCache,
    Vary: "Accept, Authorization, Cookie",
    "X-Robots-Tag": noindexHeader,
    "X-Content-Type-Options": "nosniff",
  };
}

function markdownResponse(body: string, status: number, credentialed: boolean, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { ...markdownHeaders(credentialed), ...extra } });
}

/** The limits one request counts against: the share page's per-network limit, and the MCP read limits for tokens. */
export function markdownLimitChecks(network: string, viewer: RequestViewer | null): RateLimitCheck[] {
  const checks: RateLimitCheck[] = [{ name: "artifactPageByNetwork", subject: network }];
  if (viewer?.status === "token") {
    checks.push({ name: "readByToken", subject: viewer.tokenKey }, { name: "readByUser", subject: viewer.userId });
  }
  return checks;
}

/** Counts the request against its limits. Returns a 429 to send, or null. Fails open, like every read path. */
async function refuseOverLimit(checks: RateLimitCheck[], credentialed: boolean): Promise<Response | null> {
  try {
    const refusal = await hitRateLimits(checks);
    return refusal ? tooManyRequests(refusal, markdownHeaders(credentialed)) : null;
  } catch (error) {
    console.error("[markdown] Rate limit check failed", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}

const invalidToken = "# Access token not accepted\n\nThe access token is invalid, expired, or revoked. Create a new one in artifacts.space under Connections, or leave out the Authorization header to read public and link artifacts.\n";
const unavailable = "# Try again\n\nThe artifact could not be loaded right now. Try again in a moment.\n";

type Loaded = { viewable: ViewableArtifact; userId: string | null } | Response;

/** Who is asking and what they may read, or the answer to send instead. */
async function loadForViewer(request: Request, publicId: string, credentialed: boolean): Promise<Loaded> {
  const network = networkKey(request.headers);
  const flood = await refuseOverLimit(markdownLimitChecks(network, null), credentialed);
  if (flood) return flood;
  try {
    const viewer = await resolveRequestViewer(request);
    if (viewer.status === "invalid-token") return markdownResponse(invalidToken, 401, true, { "WWW-Authenticate": 'Bearer error="invalid_token"' });
    const tokenChecks = markdownLimitChecks(network, viewer).slice(1);
    const refusal = tokenChecks.length > 0 ? await refuseOverLimit(tokenChecks, credentialed) : null;
    if (refusal) return refusal;
    const userId = viewerUserId(viewer);
    const viewable = await getViewableArtifact(publicId, userId);
    return viewable ? { viewable, userId } : markdownResponse(notFoundMarkdown(), 404, credentialed);
  } catch (error) {
    console.error("[markdown] Load failed", error instanceof Error ? error.name : "unknown error");
    return markdownResponse(unavailable, 503, credentialed, { "Retry-After": "5" });
  }
}

/**
 * The Markdown version of an artifact: a header block, the content by
 * format, its files, and with `?comments=1` the comment thread (labelled as
 * untrusted) when the comments setting lets this reader see it.
 */
export async function artifactMarkdownResponse(request: Request, publicId: string): Promise<Response> {
  const credentialed = hasCredentials(request);
  const loaded = await loadForViewer(request, publicId, credentialed);
  if (loaded instanceof Response) return loaded;
  try {
    const withComments = new URL(request.url).searchParams.get("comments") === "1";
    const input = await loadMarkdownInput(loaded.viewable, loaded.userId, withComments);
    return markdownResponse(artifactToMarkdown(input), 200, credentialed);
  } catch (error) {
    console.error("[markdown] Render failed", error instanceof Error ? error.name : "unknown error");
    return markdownResponse(unavailable, 503, credentialed, { "Retry-After": "5" });
  }
}

/**
 * The artifact's content exactly as saved, under the same access check and
 * limits: text/csv for CSV, plain text for everything else (never HTML or
 * SVG, so nothing in it can run on this site).
 */
export async function artifactRawResponse(request: Request, publicId: string): Promise<Response> {
  const credentialed = hasCredentials(request);
  const loaded = await loadForViewer(request, publicId, credentialed);
  if (loaded instanceof Response) return loaded;
  const { view } = loaded.viewable;
  const type = view.kind === "csv" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8";
  const headers = { ...markdownHeaders(credentialed, type), "Content-Security-Policy": "default-src 'none'; sandbox" };
  return new Response(view.content, { status: 200, headers });
}
