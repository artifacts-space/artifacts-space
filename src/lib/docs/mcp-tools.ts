import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";

import { registerArtifactTools } from "@/lib/mcp/artifact-tools";
import { registerFileTools } from "@/lib/mcp/file-tools";
import { registerFormatTools } from "@/lib/mcp/format-tools";
import { registerProjectTools } from "@/lib/mcp/project-tools";
import { registerTagTools } from "@/lib/mcp/tag-tools";
import { registerTeamTools } from "@/lib/mcp/team-tools";
import { registerThemeTools } from "@/lib/mcp/theme-tools";
import { toolAccess, type McpToolName } from "@/lib/mcp/tool-access";
import { registerVersionTools } from "@/lib/mcp/version-tools";
import { registerViewTools } from "@/lib/mcp/view-tools";

import { shapeRows, type PropRow } from "./prop-rows";

/**
 * The MCP tools exactly as the server registers them. The docs call the same
 * register functions as src/app/api/mcp/route.ts with a recording server, so
 * every name, title, description, and argument comes from the code. Nothing
 * here touches the database: handlers are recorded, never called.
 */

/** One registered tool, ready for the reference page. */
export interface DocsMcpTool {
  name: McpToolName;
  title: string;
  description: string;
  access: "read" | "write";
  group: McpToolGroup;
  args: PropRow[];
}

export const mcpToolGroups = ["Artifacts", "Version history", "Views", "Formats", "Themes", "Files", "Inbox and comments"] as const;
export type McpToolGroup = (typeof mcpToolGroups)[number];

interface ToolConfig {
  title?: string;
  description?: string;
  inputSchema?: Record<string, z.ZodType>;
}

function isToolName(name: string): name is McpToolName {
  return Object.hasOwn(toolAccess, name);
}

/** A stand-in McpServer that keeps each registration and nothing else. */
function recordingServer(group: McpToolGroup, into: DocsMcpTool[]): McpServer {
  const registerTool = (name: string, config: ToolConfig) => {
    if (!isToolName(name)) throw new Error(`MCP tool "${name}" is not in toolAccess.`);
    into.push({
      name,
      title: config.title ?? name,
      description: config.description ?? "",
      access: toolAccess[name],
      group,
      args: shapeRows(config.inputSchema ?? {}),
    });
    return { remove: () => undefined };
  };
  // Only registerTool is called by the register functions; the rest of McpServer is never touched.
  return { registerTool } as unknown as McpServer;
}

const docsUserId = "docs";

/** Registers every tool group, in the route's order, on recording servers. */
function recordTools(): DocsMcpTool[] {
  const tools: DocsMcpTool[] = [];
  registerArtifactTools(recordingServer("Artifacts", tools), docsUserId, "full");
  registerProjectTools(recordingServer("Artifacts", tools), docsUserId, "full");
  registerTagTools(recordingServer("Artifacts", tools), docsUserId, "full");
  registerFormatTools(recordingServer("Formats", tools), "full");
  registerThemeTools(recordingServer("Themes", tools), docsUserId, "full");
  registerFileTools(recordingServer("Files", tools), docsUserId, "full");
  registerTeamTools(recordingServer("Inbox and comments", tools), docsUserId, "full");
  registerVersionTools(recordingServer("Version history", tools), docsUserId, "full");
  registerViewTools(recordingServer("Views", tools), docsUserId, "full");
  return tools;
}

let cached: DocsMcpTool[] | undefined;

/** Every MCP tool the server registers for a full-access connection. */
export function docsMcpTools(): DocsMcpTool[] {
  cached ??= recordTools();
  return cached;
}

/** The tools in one group, in registration order. */
export function toolsInGroup(group: McpToolGroup): DocsMcpTool[] {
  return docsMcpTools().filter((tool) => tool.group === group);
}
