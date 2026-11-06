import { mcpResource } from "@/lib/oauth/config";
import { discoveryHeaders, protectedResourceMetadata, suffixPath } from "@/lib/oauth/metadata";

/**
 * RFC 9728 protected resource metadata for the MCP endpoint, served at
 * /.well-known/oauth-protected-resource and at the path-suffixed
 * /.well-known/oauth-protected-resource/api/mcp that MCP clients try first.
 */
export async function GET(_request: Request, { params }: RouteContext<"/.well-known/oauth-protected-resource/[[...path]]">) {
  const { path } = await params;
  const suffix = suffixPath(path);
  if (suffix && suffix !== new URL(mcpResource()).pathname) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json(protectedResourceMetadata(), { headers: discoveryHeaders });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...discoveryHeaders, "Access-Control-Allow-Methods": "GET, OPTIONS" } });
}
