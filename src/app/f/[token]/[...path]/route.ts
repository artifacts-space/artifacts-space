import { pageFileResponse } from "@/lib/page-files/serve";

/**
 * A page file of an HTML artifact, on its page host: `/f/<token>/<path>`
 * (src/lib/page-files/serve.ts). The proxy lets only this shape of path
 * through on a page host, and answers every other path there itself. This
 * route exists on every host, so it checks the Host itself: it answers
 * only on a page host of this deployment, for a token made for that host,
 * and with the page host's plain 404 everywhere else, the site's own host
 * included.
 */
async function answer(request: Request, context: RouteContext<"/f/[token]/[...path]">, method: "GET" | "HEAD"): Promise<Response> {
  const { token, path } = await context.params;
  return pageFileResponse({ method, host: request.headers.get("host"), headers: request.headers, token, segments: path });
}

/** Serves the file. */
export function GET(request: Request, context: RouteContext<"/f/[token]/[...path]">): Promise<Response> {
  return answer(request, context, "GET");
}

/** Answers with the file's headers and no body. */
export function HEAD(request: Request, context: RouteContext<"/f/[token]/[...path]">): Promise<Response> {
  return answer(request, context, "HEAD");
}
