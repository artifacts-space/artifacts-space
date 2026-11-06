import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";

import { getAuth } from "@/lib/auth/server";
import { AUTH_BASE_PATH, discoveryHeaders, suffixPath } from "@/lib/oauth/metadata";

/**
 * RFC 8414 authorization server metadata. The issuer is Better Auth's base
 * URL (/api/auth), so the canonical location is
 * /.well-known/oauth-authorization-server/api/auth. The root location serves
 * the same document for clients that only look there.
 */
export async function GET(request: Request, { params }: RouteContext<"/.well-known/oauth-authorization-server/[[...path]]">) {
  const { path } = await params;
  const suffix = suffixPath(path);
  if (suffix && suffix !== AUTH_BASE_PATH) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  try {
    return await oauthProviderAuthServerMetadata(getAuth(), { headers: discoveryHeaders })(request);
  } catch (error) {
    console.error("[oauth] Metadata failed", error instanceof Error ? error.name : "unknown error");
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...discoveryHeaders, "Access-Control-Allow-Methods": "GET, OPTIONS" } });
}
