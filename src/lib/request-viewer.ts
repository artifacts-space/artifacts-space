import { authenticateMcpRequest, bearerToken } from "@/lib/mcp/authenticate";
import { getSession } from "@/lib/session";

/**
 * Who is asking, for plain HTTP reads outside MCP (the Markdown version of
 * an artifact, file downloads). A bearer token is checked exactly as MCP
 * checks it (src/lib/mcp/authenticate.ts): an artifacts.space access token,
 * or an OAuth access token for this site. Without one, the session cookie
 * decides. Tokens are never logged.
 */
export type RequestViewer =
  | { status: "anonymous" }
  | { status: "session"; userId: string }
  | { status: "token"; userId: string; tokenKey: string }
  /** A bearer token was sent but is invalid, expired, or revoked. */
  | { status: "invalid-token" };

/** Resolves the viewer of a request. Throws when the token or session store cannot be reached. */
export async function resolveRequestViewer(request: Request): Promise<RequestViewer> {
  if (bearerToken(request.headers.get("authorization"))) {
    const principal = await authenticateMcpRequest(request);
    return principal ? { status: "token", userId: principal.userId, tokenKey: principal.tokenKey } : { status: "invalid-token" };
  }
  const session = await getSession();
  return session ? { status: "session", userId: session.user.id } : { status: "anonymous" };
}

/** The user id a viewer reads as, or null when signed out or the token was refused. */
export function viewerUserId(viewer: RequestViewer): string | null {
  return viewer.status === "session" || viewer.status === "token" ? viewer.userId : null;
}
