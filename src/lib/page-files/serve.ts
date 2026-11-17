import { networkPrefixKey } from "@/lib/abuse/network-key";
import { hitRateLimits } from "@/lib/abuse/rate-limit";
import { tooManyRequests } from "@/lib/abuse/responses";
import { openObject, r2ConfigFromEnv, type ObjectOpening } from "@/lib/files/r2";
import { framingSite, pageHostRefusal } from "@/lib/page-host/respond";
import { pageHostBase, pageHostRefusalHeaders, pageLabelOf } from "@/lib/page-host/rules";

import { pagePathProblem } from "./rules";
import { fixturePageArtifactId, pageFileHeaders, passedRange, type ServedPageFile } from "./serve-rules";
import { findPageFile } from "./store";
import { openPageToken, type OpenedPageToken } from "./token";

/*
 * Serving a page file on a page host: `/f/<token>/<path>`. The page host
 * holds no session. What lets a request read a file is its token, which the
 * site made for a viewer who passed the artifact's access check
 * (token.ts). A request is answered only on a page host of this
 * deployment, and only for a token made for that same host. Everything
 * else gets the page host's plain 404, the same for every reason.
 */

/** Where page files come from: the lookup, and the bytes. */
export interface PageFileSource {
  /** The file at `path` as the token's reader gets it, or null. */
  find(grant: OpenedPageToken, path: string): Promise<ServedPageFile | null>;
  open(file: ServedPageFile, options: { range: string | null; head: boolean }): Promise<ObjectOpening>;
}

/** The stored files: rows in the database, bytes in file storage. */
const storedSource: PageFileSource = {
  find: async (grant, path) => {
    const file = await findPageFile(grant.artifactId, path, grant.asOf);
    return file ? { key: file.key, contentType: file.contentType, size: file.size } : null;
  },
  open: (file, options) => openObject(r2ConfigFromEnv(), file.key, options),
};

/** The source for a grant: the stored files, or, under `next dev` only, the development fixture's files for its stand-in artifact. */
async function sourceFor(grant: OpenedPageToken): Promise<PageFileSource> {
  if (process.env.NODE_ENV === "development" && grant.artifactId === fixturePageArtifactId) return (await import("./fixture-source")).fixturePageSource;
  return storedSource;
}

/** One request for a page file, as the route hands it over. */
export interface PageFileRequest {
  method: "GET" | "HEAD";
  host: string | null;
  headers: Pick<Headers, "get">;
  token: string;
  /** The path's segments after the token. */
  segments: readonly string[];
}

/** The per-network limit on page file requests. Fails open, so a counter outage never breaks pages. */
async function overLimit(headers: Pick<Headers, "get">) {
  try {
    return await hitRateLimits([{ name: "pageFileByNetwork", subject: networkPrefixKey(headers) }]);
  } catch (error) {
    console.error("[page-files] Rate limit check failed", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}

/** The token's grant on this request's page host, or null. Reads no database. */
function grantOf(request: PageFileRequest, label: string, now: Date): OpenedPageToken | null {
  try {
    return openPageToken(request.token, label, now);
  } catch (error) {
    console.error("[page-files] A token could not be checked", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}

async function serve(request: PageFileRequest, grant: OpenedPageToken, path: string, now: Date, source: PageFileSource): Promise<Response> {
  const file = await source.find(grant, path);
  if (!file) return pageHostRefusal(404);
  const opening = await source.open(file, { range: passedRange(request.headers.get("range")), head: request.method === "HEAD" });
  if (opening.state === "missing") return pageHostRefusal(404);
  if (opening.state === "bad-range") return new Response("Range not satisfiable", { status: 416, headers: { ...pageHostRefusalHeaders, "Content-Range": `bytes */${String(file.size)}` } });
  const { object } = opening;
  const headers = pageFileHeaders({ site: framingSite(request.host), contentType: file.contentType, body: object, expiresAt: grant.expiresAt, now });
  return new Response(object.body, { status: object.status, headers });
}

/**
 * Answers a request for a page file. In order: the Host must be a page
 * host of this deployment; the path must be one a page file can have; the
 * token must open for this host (no database is read until it does); the
 * network's limit is counted; then the file is looked up and its bytes are
 * streamed from storage, never held in memory and never a redirect (a
 * redirect would break relative imports inside a module or a stylesheet).
 */
export async function pageFileResponse(request: PageFileRequest, now: Date = new Date(), source?: PageFileSource): Promise<Response> {
  const label = pageLabelOf(request.host, pageHostBase());
  const path = request.segments.join("/");
  if (!label || pagePathProblem(path) !== null) return pageHostRefusal(404);
  const grant = grantOf(request, label, now);
  if (!grant) return pageHostRefusal(404);
  const refusal = await overLimit(request.headers);
  if (refusal) return tooManyRequests(refusal, pageHostRefusalHeaders);
  try {
    return await serve(request, grant, path, now, source ?? (await sourceFor(grant)));
  } catch (error) {
    console.error("[page-files] A page file could not be served", error instanceof Error ? error.name : "unknown error");
    return new Response("The file could not be loaded. Try again.", { status: 500, headers: pageHostRefusalHeaders });
  }
}
