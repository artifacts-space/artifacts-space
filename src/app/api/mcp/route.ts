import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

import { getAuth } from "@/lib/auth";
import {
  createArtifact,
  deleteArtifact,
  getArtifact,
  listArtifacts,
  updateArtifact,
} from "@/lib/artifacts";
import { artifactKinds } from "@/lib/artifact-types";
import { authenticateApiToken } from "@/lib/tokens";

export const maxDuration = 30;

async function authenticateRequest(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authenticateApiToken(authorization.slice(7).trim());
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user.id ?? null;
}

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function createMcpServer(userId: string) {
  const server = new McpServer(
    { name: "artifacts.space", version: "1.0.0" },
    {
      instructions:
        "Use artifacts to preserve useful context across coding sessions. Save decisions, plans, research, code, and outputs. Search before creating duplicates, and include project and session identifiers when available.",
    },
  );

  server.registerTool(
    "artifacts_list",
    {
      title: "List artifacts",
      description: "List and search the current user's artifacts by title, summary, content, or project.",
      inputSchema: {
        query: z.string().max(300).optional().describe("Text to find in artifacts"),
        project: z.string().max(120).optional().describe("Exact project name"),
        limit: z.number().int().min(1).max(100).optional().default(25),
      },
    },
    async ({ query, project, limit }) => textResult(await listArtifacts(userId, { query, project, limit })),
  );

  server.registerTool(
    "artifacts_get",
    {
      title: "Get artifact",
      description: "Retrieve a complete artifact by its ID.",
      inputSchema: { id: z.string().uuid().describe("Artifact ID") },
    },
    async ({ id }) => {
      const artifact = await getArtifact(userId, id);
      if (!artifact) throw new Error("Artifact not found.");
      return textResult(artifact);
    },
  );

  server.registerTool(
    "artifacts_create",
    {
      title: "Create artifact",
      description: "Create an artifact to share context with future coding sessions and other agents.",
      inputSchema: {
        title: z.string().min(1).max(160),
        content: z.string().min(1).max(1_000_000),
        summary: z.string().max(600).optional(),
        kind: z.enum(artifactKinds).optional(),
        language: z.string().max(60).optional(),
        project: z.string().max(120).optional(),
        sessionId: z.string().max(200).optional(),
        source: z.string().max(120).optional().describe("Agent or harness name"),
        visibility: z.enum(["private", "unlisted"]).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async (input) => textResult(await createArtifact(userId, input)),
  );

  server.registerTool(
    "artifacts_update",
    {
      title: "Update artifact",
      description: "Update one or more fields of an existing artifact. Only supplied fields are changed.",
      inputSchema: {
        id: z.string().uuid(),
        title: z.string().min(1).max(160).optional(),
        content: z.string().min(1).max(1_000_000).optional(),
        summary: z.string().max(600).optional(),
        kind: z.enum(artifactKinds).optional(),
        language: z.string().max(60).optional(),
        project: z.string().max(120).optional(),
        sessionId: z.string().max(200).optional(),
        source: z.string().max(120).optional(),
        visibility: z.enum(["private", "unlisted"]).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ id, ...input }) => {
      const artifact = await updateArtifact(userId, id, input);
      if (!artifact) throw new Error("Artifact not found.");
      return textResult(artifact);
    },
  );

  server.registerTool(
    "artifacts_delete",
    {
      title: "Delete artifact",
      description: "Permanently delete an artifact by ID.",
      inputSchema: { id: z.string().uuid() },
    },
    async ({ id }) => {
      const deleted = await deleteArtifact(userId, id);
      if (!deleted) throw new Error("Artifact not found.");
      return textResult({ deleted: true, id });
    },
  );

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
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}

export async function GET() {
  return Response.json(
    { error: "Use POST for MCP requests. Standalone event streams are not enabled." },
    { status: 405, headers: { Allow: "POST, OPTIONS" } },
  );
}

export async function OPTIONS() {
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
