/**
 * A stand-in artifacts.space MCP server for the routing eval
 * (`scripts/evals/artifact-routing.mts`). It speaks MCP over stdio, offers the
 * artifact tools under their real names with the real server instructions,
 * titles, and descriptions from `src/lib/mcp/routing-copy.ts`, and answers
 * every call with a canned result. Nothing is saved and nothing leaves the
 * machine: each call is only appended, as one JSON line, to the file named by
 * ARTIFACT_ROUTING_LOG.
 *
 * Input schemas are simplified: tool search matches names and descriptions,
 * so the shapes only need to accept what an agent sends.
 *
 * The runner starts it; to try it by hand:
 *   ARTIFACT_ROUTING_LOG=/tmp/calls.jsonl node scripts/evals/artifact-routing-stub.mts
 */
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const stubArtifactUrl = "https://artifacts.space/artifact/EvalStubArtifact000000";

const toolCopySchema = z.object({ title: z.string(), description: z.string() });
const copyModuleSchema = z.object({
  SERVER_INSTRUCTIONS: z.string(),
  artifactToolCopy: z.object({
    artifacts_list: toolCopySchema,
    artifacts_get: toolCopySchema,
    teams_list: toolCopySchema,
    artifacts_create: toolCopySchema,
    artifacts_update: toolCopySchema,
    artifacts_delete: toolCopySchema,
  }),
});

/**
 * Loads the server's own words from the working tree, so the eval always
 * measures the copy the code would ship. The path is computed at run time
 * because Node runs this file directly, without the app's `@/` alias.
 */
async function loadCopy() {
  const url = pathToFileURL(join(repoRoot, "src/lib/mcp/routing-copy.ts")).href;
  const loaded: unknown = await import(url);
  return copyModuleSchema.parse(loaded);
}

/** Appends one call to the log, so the runner can count calls the transcript missed. */
function record(tool: string, args: unknown) {
  const logPath = process.env.ARTIFACT_ROUTING_LOG;
  if (!logPath) return;
  appendFileSync(logPath, `${JSON.stringify({ tool, args, at: new Date().toISOString() })}\n`);
}

/** A tool result carrying `value` as JSON text, as the real server returns it. */
function reply(tool: string, args: unknown, value: unknown) {
  record(tool, args);
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function savedArtifact(args: { title?: string | undefined; kind?: string | undefined }) {
  return {
    id: "EvalStubArtifact000000",
    url: stubArtifactUrl,
    title: args.title ?? "Untitled",
    kind: args.kind ?? "markdown",
    visibility: "private",
    note: "Routing eval stub: nothing was saved.",
  };
}

const writeShape = {
  title: z.string().optional(),
  content: z.string().optional(),
  summary: z.string().optional(),
  kind: z.string().optional(),
  language: z.string().optional(),
  icon: z.string().nullable().optional(),
  project: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  sessionId: z.string().optional(),
  source: z.string().optional(),
  visibility: z.string().optional(),
  team: z.string().optional(),
  comments: z.string().optional(),
};

function registerTools(server: McpServer, copy: z.infer<typeof copyModuleSchema>["artifactToolCopy"]) {
  server.registerTool(
    "artifacts_list",
    { ...copy.artifacts_list, inputSchema: { query: z.string().optional(), project: z.string().optional(), scope: z.string().optional(), limit: z.number().optional() } },
    (args) => reply("artifacts_list", args, []),
  );
  server.registerTool("artifacts_get", { ...copy.artifacts_get, inputSchema: { id: z.string() } }, (args) => reply("artifacts_get", args, { error: "Artifact not found." }));
  server.registerTool("teams_list", { ...copy.teams_list, inputSchema: {} }, (args) => reply("teams_list", args, [{ slug: "acme", name: "Acme", role: "owner", personal: false }]));
  server.registerTool("artifacts_create", { ...copy.artifacts_create, inputSchema: writeShape }, (args) => reply("artifacts_create", args, { artifact: savedArtifact(args), sharing: null, comments: null }));
  server.registerTool(
    "artifacts_update",
    { ...copy.artifacts_update, inputSchema: { id: z.string(), ...writeShape } },
    (args) => reply("artifacts_update", args, { artifact: savedArtifact(args), edit: "applied", sharing: null, comments: null }),
  );
  server.registerTool("artifacts_delete", { ...copy.artifacts_delete, inputSchema: { id: z.string() } }, (args) => reply("artifacts_delete", args, { deleted: true, id: args.id }));
}

async function main() {
  const copy = await loadCopy();
  const server = new McpServer({ name: "artifacts.space", version: "eval-stub" }, { instructions: copy.SERVER_INSTRUCTIONS });
  registerTools(server, copy.artifactToolCopy);
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error("[artifact-routing-stub]", error instanceof Error ? error.message : "failed to start");
  process.exit(1);
});
