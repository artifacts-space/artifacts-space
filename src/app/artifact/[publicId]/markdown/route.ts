import { artifactMarkdownResponse } from "@/lib/markdown/serve";

/*
 * The Markdown version of an artifact. src/proxy.ts rewrites
 * /artifact/<id>.md, and /artifact/<id> with Accept: text/markdown, here.
 * The handler runs the one access check itself (session cookie or bearer
 * token) and its own rate limits, so calling this path directly changes
 * nothing.
 */

export async function GET(request: Request, context: RouteContext<"/artifact/[publicId]/markdown">) {
  const { publicId } = await context.params;
  return artifactMarkdownResponse(request, publicId);
}

/** Same checks and headers as GET, without the body. */
export async function HEAD(request: Request, context: RouteContext<"/artifact/[publicId]/markdown">) {
  const response = await GET(request, context);
  return new Response(null, { status: response.status, headers: response.headers });
}
