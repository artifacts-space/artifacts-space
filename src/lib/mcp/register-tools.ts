import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { McpAccess } from "@/lib/oauth/scopes";

import { registerArtifactTools } from "./artifact-tools";
import { registerFileTools } from "./file-tools";
import { registerFormatTools } from "./format-tools";
import { registerProjectTools } from "./project-tools";
import { registerTagTools } from "./tag-tools";
import { registerTeamTools } from "./team-tools";
import { registerThemeTools } from "./theme-tools";
import { registerVersionTools } from "./version-tools";
import { registerViewTools } from "./view-tools";

/**
 * Registers every MCP tool for one connection, in the order `tools/list`
 * returns them. The MCP route and the tests that check the whole list (the
 * always-load test and the routing eval's tool snapshot) all call this, so a
 * new tool reaches each of them. Write tools are left out for read-only
 * access by each registration.
 */
export function registerAllTools(server: McpServer, userId: string, access: McpAccess) {
  registerArtifactTools(server, userId, access);
  registerProjectTools(server, userId, access);
  registerTagTools(server, userId, access);
  registerFormatTools(server, access);
  registerThemeTools(server, userId, access);
  registerFileTools(server, userId, access);
  registerTeamTools(server, userId, access);
  registerVersionTools(server, userId, access);
  registerViewTools(server, userId, access);
}
