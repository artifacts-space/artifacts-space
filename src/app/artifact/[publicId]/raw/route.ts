import { artifactRawResponse } from "@/lib/markdown/serve";

/*
 * An artifact's content exactly as saved (the Markdown version links it for
 * CSV), under the same access check and limits as the Markdown version.
 */

export async function GET(request: Request, context: RouteContext<"/artifact/[publicId]/raw">) {
  const { publicId } = await context.params;
  return artifactRawResponse(request, publicId);
}

/** Same checks and headers as GET, without the body. */
export async function HEAD(request: Request, context: RouteContext<"/artifact/[publicId]/raw">) {
  const response = await GET(request, context);
  return new Response(null, { status: response.status, headers: response.headers });
}
