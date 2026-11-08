import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { hitRateLimits, rateLimitMessage } from "@/lib/abuse/rate-limit";
import { registerArtifactTools } from "@/lib/mcp/artifact-tools";
import { authenticateMcpRequest, bearerToken, type McpPrincipal } from "@/lib/mcp/authenticate";
import { registerFileTools } from "@/lib/mcp/file-tools";
import { registerFormatTools } from "@/lib/mcp/format-tools";
import { registerProjectTools } from "@/lib/mcp/project-tools";
import { registerTagTools } from "@/lib/mcp/tag-tools";
import { jsonRpcId, mcpLimitChecks, mcpRateLimitedResponse, mcpToolCalls } from "@/lib/mcp/rate-limits";
import { registerTeamTools } from "@/lib/mcp/team-tools";
import { registerThemeTools } from "@/lib/mcp/theme-tools";
import { registerVersionTools } from "@/lib/mcp/version-tools";
import { registerViewTools } from "@/lib/mcp/view-tools";
import { READ_ONLY_INSTRUCTIONS } from "@/lib/mcp/tool-access";
import { bearerChallenge } from "@/lib/oauth/metadata";

export const maxDuration = 30;

const INSTRUCTIONS =
  "Use artifacts to preserve useful context across coding sessions. Save decisions, plans, research, code, and outputs. Search before creating duplicates, and include project and session identifiers when available: set `project` to a project name (projects_list shows the ones that exist; a new name creates one), and `tags` to reuse the tags tags_list shows. Give each artifact a fitting page icon with `icon` (one emoji or tabler:<name>), and optionally a `theme` preset and a `cover` gradient from themes_list. Artifacts are private by default; teams_list shows the teams you can share with. You can edit artifacts shared through your team, and every save is kept in the history (artifacts_versions). Sharing and edits to shared artifacts may need a team owner's or admin's approval, and agents never approve.";

function createMcpServer({ userId, access }: McpPrincipal) {
  const server = new McpServer(
    { name: "artifacts.space", version: "1.0.0" },
    { instructions: access === "read" ? `${INSTRUCTIONS} ${READ_ONLY_INSTRUCTIONS}` : INSTRUCTIONS },
  );

  registerArtifactTools(server, userId, access);
  registerProjectTools(server, userId, access);
  registerTagTools(server, userId, access);
  registerFormatTools(server, access);
  registerThemeTools(server, userId, access);
  registerFileTools(server, userId, access);
  registerTeamTools(server, userId, access);
  registerVersionTools(server, userId, access);
  registerViewTools(server, userId, access);
  return server;
}

/**
 * 401 with the RFC 9728 challenge, so MCP clients can find the authorization
 * server and start OAuth. A token that was sent but not accepted also gets
 * `error="invalid_token"`, which tells clients to refresh or sign in again.
 */
function unauthorized(request: Request) {
  const sentToken = bearerToken(request.headers.get("authorization")) !== null;
  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code: -32001, message: sentToken ? "The access token is invalid, expired, or revoked. Connect again." : "Authentication required. Connect with OAuth or an artifacts.space bearer token." },
      id: null,
    },
    { status: 401, headers: { "WWW-Authenticate": bearerChallenge(process.env, sentToken ? "invalid_token" : undefined) } },
  );
}

/**
 * Applies the per-token and per-user read and edit limits for the tools this
 * request calls. Returns a 429 to send instead, or null to go on. Fails open:
 * a counter outage must not take MCP down with it.
 */
async function refuseOverLimit(request: Request, principal: McpPrincipal): Promise<Response | null> {
  try {
    const body: unknown = await request.clone().json().catch(() => null);
    const refusal = await hitRateLimits(mcpLimitChecks(principal, mcpToolCalls(body)));
    if (!refusal) return null;
    return mcpRateLimitedResponse(refusal, rateLimitMessage(refusal.name, refusal.retryAfterSeconds), jsonRpcId(body));
  } catch (error) {
    console.error("[mcp] Rate limit check failed", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}

export async function POST(request: Request) {
  let principal: McpPrincipal | null;
  try {
    principal = await authenticateMcpRequest(request);
  } catch (error) {
    console.error("[mcp] Authentication failed", error instanceof Error ? error.name : "unknown error");
    return Response.json({ jsonrpc: "2.0", error: { code: -32603, message: "Could not check the access token. Try again." }, id: null }, { status: 503 });
  }
  if (!principal) return unauthorized(request);
  const refusal = await refuseOverLimit(request, principal);
  if (refusal) return refusal;

  const server = createMcpServer(principal);
  // No sessionIdGenerator: the transport runs stateless, one request per server.
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}

export function GET() {
  return Response.json(
    { error: "Use POST for MCP requests. Standalone event streams are not enabled." },
    { status: 405, headers: { Allow: "POST, OPTIONS" } },
  );
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "POST, OPTIONS",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Protocol-Version",
      "Access-Control-Expose-Headers": "WWW-Authenticate, Retry-After",
      "Access-Control-Max-Age": "86400",
    },
  });
}
