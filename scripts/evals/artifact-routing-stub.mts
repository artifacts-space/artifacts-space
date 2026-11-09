/**
 * A stand-in artifacts.space MCP server for the routing eval
 * (`scripts/evals/artifact-routing.mts`). It speaks MCP over stdio and serves
 * `artifact-routing-tools.json`: the server instructions and every tool a
 * full-access connection lists, with the same names, titles, descriptions,
 * input schemas, and `_meta`. A test keeps that file equal to what the server
 * ships, and the runner refreshes it before each pass.
 *
 * Every call gets a canned result. Nothing is saved and nothing leaves the
 * machine: each call is appended, as one JSON line, to the file named by
 * ARTIFACT_ROUTING_LOG, and the runner reads it to count saves the transcript
 * missed.
 *
 * The runner starts it; to try it by hand:
 *   ARTIFACT_ROUTING_LOG=/tmp/calls.jsonl node scripts/evals/artifact-routing-stub.mts
 */
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const toolsPath = fileURLToPath(new URL("./artifact-routing-tools.json", import.meta.url));
const stubArtifactId = "EvalStubArtifact000000";

const toolSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()),
  _meta: z.record(z.string(), z.unknown()).optional(),
});
const toolsFileSchema = z.object({ instructions: z.string(), tools: z.array(toolSchema).min(1) });

/** Tools whose result is the saved artifact. */
const SAVE_TOOLS = new Set(["artifacts_create", "artifacts_update", "files_create_artifact", "artifacts_restore_version"]);

/** Appends one call to the log, so the runner can count saves the transcript missed. */
function record(tool: string, args: unknown) {
  const logPath = process.env.ARTIFACT_ROUTING_LOG;
  if (!logPath) return;
  appendFileSync(logPath, `${JSON.stringify({ tool, args, at: new Date().toISOString() })}\n`);
}

const titleSchema = z.object({ title: z.string().optional(), kind: z.string().optional() });

/** A plausible result for each tool, so the agent can finish as it would against the real server. */
function cannedResult(tool: string, args: unknown): unknown {
  if (SAVE_TOOLS.has(tool)) {
    const { title, kind } = titleSchema.catch({}).parse(args);
    const artifact = { id: stubArtifactId, url: `https://artifacts.space/artifact/${stubArtifactId}`, title: title ?? "Untitled", kind: kind ?? "markdown", visibility: "private" };
    return { artifact, edit: "applied", sharing: null, comments: null, note: "Routing eval stub: nothing was saved." };
  }
  if (tool === "teams_list") return [{ slug: "acme", name: "Acme", role: "owner", personal: false, teamSharingNeedsApproval: false }];
  if (tool === "artifacts_get") return { error: "Artifact not found." };
  if (tool.endsWith("_list")) return [];
  return { ok: true, note: "Routing eval stub: nothing was changed." };
}

function registerTools(server: McpServer, tools: z.infer<typeof toolSchema>[]) {
  for (const tool of tools) {
    const config = {
      ...(tool.title ? { title: tool.title } : {}),
      ...(tool.description ? { description: tool.description } : {}),
      ...(tool._meta ? { _meta: tool._meta } : {}),
      inputSchema: z.fromJSONSchema(tool.inputSchema),
    };
    server.registerTool(tool.name, config, (args: unknown) => {
      record(tool.name, args);
      return { content: [{ type: "text" as const, text: JSON.stringify(cannedResult(tool.name, args), null, 2) }] };
    });
  }
}

function main() {
  const { instructions, tools } = toolsFileSchema.parse(JSON.parse(readFileSync(toolsPath, "utf8")));
  const server = new McpServer({ name: "artifacts.space", version: "eval-stub" }, { instructions });
  registerTools(server, tools);
  return server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error("[artifact-routing-stub]", error instanceof Error ? error.message : "failed to start");
  process.exit(1);
});
