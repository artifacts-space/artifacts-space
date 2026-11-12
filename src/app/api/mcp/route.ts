import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { hitRateLimits, rateLimitMessage } from "@/lib/abuse/rate-limit";
import { authenticateMcpRequest, bearerToken, type McpPrincipal } from "@/lib/mcp/authenticate";
import type { HarnessSource } from "@/lib/mcp/harness-context";
import { registerAllTools } from "@/lib/mcp/register-tools";
import { connectionHarness, recordRequestClientInfo } from "@/lib/mcp/request-harness";
import { jsonRpcId, mcpLimitChecks, mcpRateLimitedResponse, mcpToolCalls } from "@/lib/mcp/rate-limits";
import { SERVER_INSTRUCTIONS } from "@/lib/mcp/routing-copy";
import { mcpServerInfo } from "@/lib/mcp/server-info";
import { READ_ONLY_INSTRUCTIONS } from "@/lib/mcp/tool-access";
import { bearerChallenge } from "@/lib/oauth/metadata";

export const maxDuration = 30;

function createMcpServer({ userId, access }: McpPrincipal, harness: HarnessSource) {
  const server = new McpServer(
    mcpServerInfo(),
    { instructions: access === "read" ? `${SERVER_INSTRUCTIONS} ${READ_ONLY_INSTRUCTIONS}` : SERVER_INSTRUCTIONS },
  );

  registerAllTools(server, userId, access, harness);
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
async function refuseOverLimit(body: unknown, principal: McpPrincipal): Promise<Response | null> {
  try {
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
  const body: unknown = await request.clone().json().catch(() => null);
  const refusal = await refuseOverLimit(body, principal);
  if (refusal) return refusal;

  // The transport is stateless: keep what the client says it is (clientInfo) for its later requests.
  const clientInfo = await recordRequestClientInfo(principal.connection, body);
  const server = createMcpServer(principal, connectionHarness(principal.connection, clientInfo));
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
