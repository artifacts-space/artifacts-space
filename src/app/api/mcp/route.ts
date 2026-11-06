import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { registerArtifactTools } from "@/lib/mcp/artifact-tools";
import { registerFormatTools } from "@/lib/mcp/format-tools";
import { getSession } from "@/lib/session";
import { authenticateApiToken } from "@/lib/tokens";

export const maxDuration = 30;

async function authenticateRequest(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authenticateApiToken(authorization.slice(7).trim());
  }

  const session = await getSession();
  return session?.user.id ?? null;
}

function createMcpServer(userId: string) {
  const server = new McpServer(
    { name: "artifacts.space", version: "1.0.0" },
    {
      instructions:
        "Use artifacts to preserve useful context across coding sessions. Save decisions, plans, research, code, and outputs. Search before creating duplicates, and include project and session identifiers when available. Artifacts are private by default; teams_list shows the teams you can share with. Sharing and edits to shared artifacts may need a team owner's or admin's approval, and agents never approve.",
    },
  );

  registerArtifactTools(server, userId);
  registerFormatTools(server);
  return server;
}

export async function POST(request: Request) {
  const userId = await authenticateRequest(request);
  if (!userId) {
    return Response.json(
      { error: "Authentication required. Provide an artifacts.space bearer token." },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }

  const server = createMcpServer(userId);
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
      "Access-Control-Max-Age": "86400",
    },
  });
}
