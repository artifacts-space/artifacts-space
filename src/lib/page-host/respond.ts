import { siteOrigin } from "@/lib/site-origin";

import { frameDocument } from "./frame-document";
import { hostPort, isPageSourceRequest, pageHostBase, pageHostHeaders, pageHostPath, pageHostRefusalHeaders, pageLabelOf, type FramePlace } from "./rules";

/** What the proxy needs of a request to answer for a page host. */
export interface PageHostRequest {
  method: string;
  /** The path alone: a query or a hash is the page's own, and never decides the answer. */
  pathname: string;
  host: string | null;
  headers: Pick<Headers, "get">;
}

/**
 * The site's origin as the frame document may trust it. Never the request,
 * except under `next dev`, where the server's port is not known ahead: there
 * the site is `localhost` on the port the request came to.
 */
export function framingSite(host: string | null, env: NodeJS.ProcessEnv = process.env): string {
  if (env.NODE_ENV !== "development") return siteOrigin(env);
  const port = hostPort(host);
  return `http://localhost${port ? `:${port}` : ""}`;
}

/** Where the frame document answers: `/`, or under a files address, as the first page or another. */
function framePlace(pathname: string, path: "frame" | "page"): FramePlace {
  if (path === "page") return "page";
  return pathname === "/" ? "root" : "index";
}

/** The answer where nothing is served: on a page host's other paths, and on every other host under the page domain. */
export function pageHostRefusal(status: 404 | 405 = 404): Response {
  return new Response(status === 405 ? "Method not allowed" : "Not found", { status, headers: pageHostRefusalHeaders });
}

/**
 * The answer for a request whose Host looks like a page host, or null for
 * the one kind of request the proxy lets through: a GET or HEAD of a page
 * file (`/f/<token>/<path>`) on a page host of this deployment's page
 * domain, which its route answers (src/lib/page-files/serve.ts). Here: the
 * frame document at `/`, at `/f/<token>/index.html` for a page with files,
 * and at the address of every other page of the site (`about.html`) for a
 * browser that goes there; a 404 for everything else, so no app page, no
 * API, and no sign-in exists on a page host and no session can. Only the
 * frame document's own fetch of a page's source (isPageSourceRequest) goes
 * on to the route, which answers it as text.
 */
export function pageHostResponse(request: PageHostRequest, env: NodeJS.ProcessEnv = process.env): Response | null {
  const label = pageLabelOf(request.host, pageHostBase(env));
  const path = label ? pageHostPath(request.pathname) : "none";
  if (path === "none") return pageHostRefusal(404);
  if (request.method !== "GET" && request.method !== "HEAD") return pageHostRefusal(405);
  if (path === "file" || (path === "page" && isPageSourceRequest(request.headers))) return null;
  const site = framingSite(request.host, env);
  const headers = pageHostHeaders(site, env.NODE_ENV !== "development", framePlace(request.pathname, path));
  return new Response(request.method === "HEAD" ? null : frameDocument(site), { status: 200, headers });
}
