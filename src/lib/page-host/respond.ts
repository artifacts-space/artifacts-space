import { siteOrigin } from "@/lib/site-origin";

import { frameDocument } from "./frame-document";
import { hostPort, pageHostBase, pageHostHeaders, pageHostRefusalHeaders, pageLabelOf } from "./rules";

/** What the proxy needs of a request to answer for a page host. */
export interface PageHostRequest {
  method: string;
  pathname: string;
  host: string | null;
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

function refuse(status: number): Response {
  return new Response(status === 405 ? "Method not allowed" : "Not found", { status, headers: pageHostRefusalHeaders });
}

/**
 * The whole answer for a request whose Host looks like a page host. The
 * frame document at `/` of a page host on this deployment's page domain;
 * nothing else, ever: no app page, no API, no file, no sign-in, so no
 * session can exist there and a page has nothing to call.
 */
export function pageHostResponse(request: PageHostRequest, env: NodeJS.ProcessEnv = process.env): Response {
  const label = pageLabelOf(request.host, pageHostBase(env));
  if (!label || request.pathname !== "/") return refuse(404);
  if (request.method !== "GET" && request.method !== "HEAD") return refuse(405);
  const site = framingSite(request.host, env);
  const headers = pageHostHeaders(site, env.NODE_ENV !== "development");
  return new Response(request.method === "HEAD" ? null : frameDocument(site), { status: 200, headers });
}
